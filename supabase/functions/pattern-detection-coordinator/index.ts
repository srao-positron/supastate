import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'
import { DBLogger } from '../pattern-processor/db-logger.ts'
import { logger, setLogger } from '../pattern-processor/safe-logger.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Number of concurrent workers to spawn for pattern detection
// Pattern detection is memory intensive in Neo4j, so we use just 1 worker
const WORKER_COUNT = 1

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

    await logger.info('Pattern detection coordinator started', { batchId, workerCount: WORKER_COUNT })

    // Check if there are messages in the queue
    const { data: queueStatus, error: statusError } = await supabase.rpc('pgmq_metrics', {
      p_queue_name: 'pattern_detection'
    })

    if (statusError) {
      await logger.error('Failed to get queue metrics', statusError)
      await dbLogger.close()
      return new Response(JSON.stringify({ 
        error: 'Failed to get queue metrics',
        details: statusError
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      })
    }

    // pgmq_metrics returns an array with one row
    const metrics = Array.isArray(queueStatus) ? queueStatus[0] : queueStatus
    const queueLength = metrics?.queue_length || 0

    if (queueLength === 0) {
      await logger.info('No messages in pattern detection queue')
      await dbLogger.close()
      return new Response(JSON.stringify({ 
        message: 'No pattern detection jobs to process',
        workersSpawned: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    await logger.info(`Found ${queueLength} pattern detection jobs in queue, reading messages for distribution`)

    // Read ALL messages from the queue first
    const { data: allMessages, error: readError } = await supabase.rpc('pgmq_read', {
      queue_name: 'pattern_detection',
      vt: 600, // 10 minute visibility timeout
      qty: 1000 // Read up to 1000 messages
    })

    if (readError) {
      throw new Error(`Failed to read from queue: ${readError.message}`)
    }

    if (!allMessages || allMessages.length === 0) {
      await logger.info('No messages found in queue')
      await dbLogger.close()
      return new Response(JSON.stringify({ 
        message: 'No messages to process',
        workersSpawned: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    await logger.info(`Read ${allMessages.length} messages from queue, distributing to workers`)

    // Distribute messages among workers
    const messagesPerWorker = Math.ceil(allMessages.length / WORKER_COUNT)
    const workerPromises = []
    
    for (let i = 0; i < WORKER_COUNT; i++) {
      const workerId = `${batchId}-pattern-worker-${i}`
      const startIdx = i * messagesPerWorker
      const endIdx = Math.min(startIdx + messagesPerWorker, allMessages.length)
      const workerMessages = allMessages.slice(startIdx, endIdx)
      
      if (workerMessages.length === 0) {
        continue // Skip if no messages for this worker
      }
      
      // Spawn background task with specific messages
      const workerPromise = fetch(`${supabaseUrl}/functions/v1/pattern-detection-worker`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          workerId,
          batchId,
          workerIndex: i,
          totalWorkers: WORKER_COUNT,
          messages: workerMessages // Pass specific messages to worker
        })
      })

      workerPromises.push(workerPromise)
      
      await logger.info(`Spawned pattern detection worker ${i} with ${workerMessages.length} messages`, { 
        workerId,
        messageCount: workerMessages.length
      })
    }

    // Wait for all workers to complete their processing
    await logger.info('Waiting for pattern workers to complete processing...')
    
    const results = await Promise.allSettled(workerPromises)
    let totalProcessed = 0
    let totalErrors = 0
    const workerResults = []

    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      if (result.status === 'fulfilled' && result.value.ok) {
        try {
          const workerResponse = await result.value.json()
          totalProcessed += workerResponse.processed || 0
          totalErrors += workerResponse.errors?.length || 0
          workerResults.push({
            worker: i,
            processed: workerResponse.processed,
            errors: workerResponse.errors?.length || 0
          })
        } catch (e) {
          await logger.error(`Failed to parse worker ${i} response`, e)
        }
      } else {
        await logger.error(`Worker ${i} failed`, result.status === 'rejected' ? result.reason : 'Response not ok')
        workerResults.push({
          worker: i,
          error: result.status === 'rejected' ? result.reason?.message : 'Request failed'
        })
      }
    }

    await logger.info('All pattern workers completed', { 
      totalProcessed,
      totalErrors,
      workerResults
    })

    await dbLogger.close()

    return new Response(
      JSON.stringify({ 
        message: `Processed ${totalProcessed} pattern detection jobs with ${totalErrors} errors`,
        processed: totalProcessed,
        errors: totalErrors,
        workerResults,
        queueLength: allMessages.length
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error('Pattern coordinator error:', error)
    if (dbLogger) {
      await logger.error('Pattern coordinator fatal error', error)
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