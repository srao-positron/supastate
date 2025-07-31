#!/usr/bin/env npx tsx

/**
 * Check worker execution logs for ingestion workers
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkWorkerLogs() {
  console.log('=== Checking Worker Execution Logs ===\n')

  // Check worker execution logs
  const { data: workerLogs, error: workerError } = await supabase
    .from('worker_execution_logs')
    .select('*')
    .or(
      'worker_name.eq.memory-ingestion-worker,' +
      'worker_name.eq.code-ingestion-worker,' +
      'worker_name.eq.ingest-memory-to-neo4j,' +
      'worker_name.eq.ingest-code-to-neo4j'
    )
    .gte('created_at', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()) // Last 6 hours
    .order('created_at', { ascending: false })
    .limit(100)

  if (workerError) {
    console.error('Error fetching worker logs:', workerError)
    
    // Check if table exists
    const { data: tables } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .eq('table_name', 'worker_execution_logs')
      .single()

    if (!tables) {
      console.log('\nworker_execution_logs table does not exist!')
    }
    return
  }

  if (!workerLogs || workerLogs.length === 0) {
    console.log('No worker execution logs found in the last 6 hours')
    console.log('\nChecking pattern_processor_logs for ingestion info...')
    
    // Check pattern processor logs which might have ingestion info
    const { data: patternLogs, error: patternError } = await supabase
      .from('pattern_processor_logs')
      .select('*')
      .or('action.eq.memory_ingestion,action.eq.code_ingestion')
      .gte('created_at', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(50)

    if (!patternError && patternLogs && patternLogs.length > 0) {
      console.log(`\nFound ${patternLogs.length} pattern processor logs related to ingestion:`)
      patternLogs.forEach(log => {
        console.log(`\n[${log.created_at}] ${log.action}`)
        console.log(`Status: ${log.status}`)
        if (log.error_message) {
          console.log(`ERROR: ${log.error_message}`)
        }
        if (log.metadata) {
          console.log(`Metadata: ${JSON.stringify(log.metadata, null, 2)}`)
        }
      })
    }
    return
  }

  // Group logs by worker
  const logsByWorker = workerLogs.reduce((acc, log) => {
    const worker = log.worker_name
    if (!acc[worker]) acc[worker] = { errors: [], successes: [], total: 0 }
    acc[worker].total++
    if (log.status === 'error') {
      acc[worker].errors.push(log)
    } else if (log.status === 'success') {
      acc[worker].successes.push(log)
    }
    return acc
  }, {} as Record<string, { errors: any[], successes: any[], total: number }>)

  // Display summary
  console.log('Summary by Worker:')
  for (const [worker, stats] of Object.entries(logsByWorker)) {
    console.log(`\n${worker}:`)
    console.log(`  Total: ${stats.total}`)
    console.log(`  Errors: ${stats.errors.length}`)
    console.log(`  Successes: ${stats.successes.length}`)
  }

  // Show recent errors
  console.log('\n\n=== Recent Errors ===')
  for (const [worker, stats] of Object.entries(logsByWorker)) {
    if (stats.errors.length > 0) {
      console.log(`\n${worker} errors:`)
      stats.errors.slice(0, 3).forEach(log => {
        console.log(`\n[${log.created_at}]`)
        console.log(`Error: ${log.error_message}`)
        if (log.metadata) {
          console.log(`Context: ${JSON.stringify(log.metadata, null, 2)}`)
        }
      })
    }
  }

  // Show recent successes
  console.log('\n\n=== Recent Successes ===')
  for (const [worker, stats] of Object.entries(logsByWorker)) {
    if (stats.successes.length > 0) {
      console.log(`\n${worker} successes:`)
      stats.successes.slice(0, 2).forEach(log => {
        console.log(`\n[${log.created_at}]`)
        console.log(`Duration: ${log.duration_ms}ms`)
        if (log.metadata) {
          console.log(`Processed: ${JSON.stringify(log.metadata, null, 2)}`)
        }
      })
    }
  }

  // Check queue status
  console.log('\n\n=== Current Queue Status ===')
  
  // Check memory queue metrics
  const { data: memoryMetrics } = await supabase.rpc('pgmq_metrics', {
    queue_name: 'memory_ingestion_queue'
  })
  
  if (memoryMetrics) {
    console.log('\nMemory Ingestion Queue:')
    console.log(`  Queue Length: ${memoryMetrics.queue_length || 0}`)
    console.log(`  Total Messages: ${memoryMetrics.total_messages || 0}`)
  }

  // Check code queue metrics
  const { data: codeMetrics } = await supabase.rpc('pgmq_metrics', {
    queue_name: 'code_ingestion_queue'
  })
  
  if (codeMetrics) {
    console.log('\nCode Ingestion Queue:')
    console.log(`  Queue Length: ${codeMetrics.queue_length || 0}`)
    console.log(`  Total Messages: ${codeMetrics.total_messages || 0}`)
  }

  // Check for Neo4j edge function calls
  console.log('\n\n=== Checking for Neo4j Function Invocations ===')
  
  // Query Supabase API logs if available
  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
  
  console.log('\nNote: Edge function logs are in the Supabase Dashboard')
  console.log('Go to: https://supabase.com/dashboard/project/zqlfxakbkwssxfynrmnk/logs/edge-functions')
  console.log('\nOr run this SQL query in the dashboard:')
  console.log(`
SELECT 
  id,
  timestamp,
  event_message,
  metadata.function_id as function_id
FROM function_logs
CROSS JOIN unnest(metadata) as metadata
WHERE event_message LIKE '%ingest%neo4j%'
   OR event_message LIKE '%memory-ingestion%'
   OR event_message LIKE '%code-ingestion%'
   OR metadata.function_id IN (
     SELECT id FROM edge_functions 
     WHERE name LIKE '%ingest%'
   )
AND timestamp > '${threeHoursAgo}'::timestamptz
ORDER BY timestamp DESC
LIMIT 100;
  `)
}

// Run the check
checkWorkerLogs().catch(console.error)