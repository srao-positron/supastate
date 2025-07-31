import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'
import { DBLogger } from '../pattern-processor/db-logger.ts'
import { logger, setLogger } from '../pattern-processor/safe-logger.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Global error handler
globalThis.addEventListener('error', async (event) => {
  console.error('Unhandled error:', event.error)
  
  // Try to log to database if possible
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (supabaseUrl && supabaseServiceKey) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey)
      await supabase.from('pattern_processor_logs').insert({
        batch_id: 'unhandled-error',
        level: 'error',
        message: 'Unhandled error in code-ingestion-worker',
        details: {
          error: event.error?.message || 'Unknown error',
          stack: event.error?.stack,
          type: event.type
        },
        error_stack: event.error?.stack
      })
    }
  } catch (logError) {
    console.error('Failed to log unhandled error:', logError)
  }
})

globalThis.addEventListener('unhandledrejection', async (event) => {
  console.error('Unhandled rejection:', event.reason)
  
  // Try to log to database if possible
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (supabaseUrl && supabaseServiceKey) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey)
      await supabase.from('pattern_processor_logs').insert({
        batch_id: 'unhandled-rejection',
        level: 'error',
        message: 'Unhandled promise rejection in code-ingestion-worker',
        details: {
          reason: event.reason?.message || event.reason || 'Unknown reason',
          stack: event.reason?.stack,
          type: event.type
        },
        error_stack: event.reason?.stack
      })
    }
  } catch (logError) {
    console.error('Failed to log unhandled rejection:', logError)
  }
})

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const batchId = crypto.randomUUID()
  let supabase: any
  let dbLogger: DBLogger

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Initialize DB logger
    dbLogger = new DBLogger(supabase, batchId)
    setLogger(dbLogger)

    // Parse request body to get messages from coordinator
    const requestData = await req.json()
    const { workerId, messages, workerIndex } = requestData

    await logger.info('Code ingestion worker started', { 
      batchId, 
      workerId,
      workerIndex,
      messageCount: messages?.length || 0
    })

    // Validate messages from coordinator
    if (!messages || messages.length === 0) {
      await logger.info('No messages provided by coordinator')
      await dbLogger.close()
      return new Response(JSON.stringify({ processed: 0, message: 'No messages provided' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    await logger.info(`Processing ${messages.length} code ingestion messages`)

    // Track workspaces that need pattern detection
    const workspacesProcessed = new Set<string>()
    let processedCount = 0
    const errors = []

    for (const msg of messages) {
      try {
        const { code_entity_id, user_id, workspace_id, content, metadata } = msg.message

        await logger.info('Processing code entity', {
          msg_id: msg.msg_id,
          code_entity_id,
          user_id,
          workspace_id
        })

        // Get the code entity from Supabase
        const { data: codeEntity, error: codeError } = await supabase
          .from('code_entities')
          .select('*')
          .eq('id', code_entity_id)
          .single()

        if (codeError || !codeEntity) {
          throw new Error(`Code entity not found: ${code_entity_id}`)
        }

        // Call the Neo4j ingestion service
        const response = await fetch(`${supabaseUrl}/functions/v1/ingest-code-to-neo4j`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            code_entities: [codeEntity],
            user_id,
            workspace_id
          })
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Neo4j code ingestion failed: ${response.statusText} - ${errorText}`)
        }

        // Track workspace for pattern detection
        if (workspace_id) {
          workspacesProcessed.add(workspace_id)
        } else if (user_id) {
          workspacesProcessed.add(`user:${user_id}`)
        }

        // Delete the message from the queue (mark as processed)
        const { error: deleteError } = await supabase.rpc('pgmq_delete', {
          queue_name: 'code_ingestion',
          msg_id: msg.msg_id
        })

        if (deleteError) {
          await logger.warn(`Failed to delete message ${msg.msg_id}`, { error: deleteError.message })
        }

        processedCount++
        await logger.info('Code entity processed successfully', {
          code_entity_id,
          workspace_id,
          msg_id: msg.msg_id
        })

      } catch (error) {
        await logger.error(`Failed to process message ${msg.msg_id}`, error, {
          code_entity_id: msg.message.code_entity_id
        })
        errors.push({ msg_id: msg.msg_id, error: error.message })
        
        // Move to DLQ after too many retries
        if (msg.read_ct > 3) {
          await logger.warn('Moving message to DLQ after 3 retries', { msg_id: msg.msg_id })
          await supabase.rpc('pgmq_archive', {
            queue_name: 'code_ingestion',
            msg_id: msg.msg_id
          })
        }
      }
    }

    // EntitySummaries are now created inline during code ingestion
    // No need to call create-entity-summaries separately

    // Queue pattern detection for each workspace that had successful ingestions
    if (workspacesProcessed.size > 0) {
      await logger.info('Queueing pattern detection for workspaces', {
        workspaces: Array.from(workspacesProcessed)
      })

      for (const workspaceId of workspacesProcessed) {
        try {
          const { data: msgId, error: patternQueueError } = await supabase.rpc('queue_pattern_detection_job', {
            p_batch_id: crypto.randomUUID(),
            p_pattern_types: ['debugging', 'learning', 'refactoring', 'temporal', 'semantic', 'memory_code'],
            p_limit: 100,
            p_workspace_id: workspaceId
          })

          if (patternQueueError) {
            await logger.error('Failed to queue pattern detection', patternQueueError, { workspaceId })
          } else {
            await logger.info('Pattern detection queued', { workspaceId, msgId })
          }
        } catch (error) {
          await logger.error('Error queueing pattern detection', error, { workspaceId })
        }
      }
    }

    await logger.info('Code ingestion batch complete', {
      processed: processedCount,
      errors: errors.length,
      workspacesTriggered: workspacesProcessed.size
    })

    await dbLogger.close()

    return new Response(
      JSON.stringify({ 
        processed: processedCount,
        errors: errors.length > 0 ? errors : undefined,
        message: `Processed ${processedCount} code ingestion jobs`,
        patternDetectionQueued: workspacesProcessed.size
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error('Worker error:', error)
    if (dbLogger) {
      await logger.error('Worker fatal error', error)
      await dbLogger.close()
    }
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: error.stack 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})