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
        message: 'Unhandled error in pattern-detection-worker',
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
        message: 'Unhandled rejection in pattern-detection-worker',
        details: {
          reason: event.reason?.message || event.reason,
          type: event.type
        }
      })
    }
  } catch (logError) {
    console.error('Failed to log unhandled rejection:', logError)
  }
})

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
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

    await logger.info('Pattern detection worker started', { 
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

    // Process each message by delegating to pattern-processor
    let processedCount = 0
    const errors = []
    
    for (const msg of messages) {
      const jobBatchId = msg.message.batch_id || crypto.randomUUID()
      
      await logger.info('Processing pattern detection job', {
        msg_id: msg.msg_id,
        batch_id: jobBatchId,
        pattern_types: msg.message.pattern_types,
        workspace_id: msg.message.workspace_id
      })

      try {
        // Call the pattern-processor edge function
        const response = await fetch(`${supabaseUrl}/functions/v1/pattern-processor`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            batch_id: jobBatchId,
            pattern_types: msg.message.pattern_types,
            limit: msg.message.limit,
            workspace_id: msg.message.workspace_id
          })
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Pattern processor failed: ${response.statusText} - ${errorText}`)
        }

        const result = await response.json()
        await logger.info('Pattern detection completed', {
          msg_id: msg.msg_id,
          patterns_found: result.patterns_found,
          duration_ms: result.duration_ms
        })

        // Delete the message from the queue after successful processing
        await supabase.rpc('pgmq_delete', {
          queue_name: 'pattern_detection',
          msg_id: msg.msg_id
        })

        processedCount++
      } catch (error) {
        await logger.error('Pattern detection failed', error, {
          msg_id: msg.msg_id,
          batch_id: jobBatchId
        })
        errors.push({ msg_id: msg.msg_id, error: error.message })
        
        // Move to DLQ after too many retries
        if (msg.read_ct > 3) {
          await logger.warn('Moving message to DLQ after 3 retries', { msg_id: msg.msg_id })
          await supabase.rpc('pgmq_archive', {
            queue_name: 'pattern_detection',
            msg_id: msg.msg_id
          })
        }
      }
    }

    await logger.info('Pattern detection batch complete', {
      processed: processedCount,
      errors: errors.length
    })

    await dbLogger.close()

    return new Response(
      JSON.stringify({
        processed: processedCount,
        errors: errors.length,
        message: `Processed ${processedCount} pattern detection jobs`
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Worker error:', error)
    await logger?.error('Worker failed', error)
    await dbLogger?.close()
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})