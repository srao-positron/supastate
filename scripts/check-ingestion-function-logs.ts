#!/usr/bin/env npx tsx

/**
 * Check logs for memory and code ingestion workers
 * Focus on identifying issues preventing data from reaching Neo4j
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkIngestionLogs() {
  console.log('=== Checking Ingestion Worker Logs ===\n')

  // Check function_logs table for ingestion workers
  const { data: logs, error } = await supabase
    .from('function_logs')
    .select('*')
    .or(
      'function_name.eq.memory-ingestion-worker,' +
      'function_name.eq.code-ingestion-worker,' +
      'function_name.eq.ingest-memory-to-neo4j,' +
      'function_name.eq.ingest-code-to-neo4j,' +
      'function_name.eq.memory-ingestion-coordinator,' +
      'function_name.eq.code-ingestion-coordinator'
    )
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    console.error('Error fetching logs:', error)
    return
  }

  if (!logs || logs.length === 0) {
    console.log('No ingestion logs found in the last 24 hours')
    console.log('\nChecking if function_logs table exists...')
    
    // Check if the table exists
    const { data: tables } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .eq('table_name', 'function_logs')
      .single()

    if (!tables) {
      console.log('function_logs table does not exist!')
      console.log('\nLet me check worker execution logs instead...')
      
      // Check worker execution logs
      const { data: workerLogs, error: workerError } = await supabase
        .from('worker_execution_logs')
        .select('*')
        .or(
          'worker_name.eq.memory-ingestion-worker,' +
          'worker_name.eq.code-ingestion-worker'
        )
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(50)

      if (workerError) {
        console.error('Error fetching worker logs:', workerError)
      } else if (workerLogs && workerLogs.length > 0) {
        console.log(`\nFound ${workerLogs.length} worker execution logs:`)
        workerLogs.forEach(log => {
          console.log(`\n[${log.created_at}] ${log.worker_name}`)
          console.log(`Status: ${log.status}`)
          console.log(`Duration: ${log.duration_ms}ms`)
          if (log.error_message) {
            console.log(`ERROR: ${log.error_message}`)
          }
          if (log.metadata) {
            console.log(`Metadata: ${JSON.stringify(log.metadata, null, 2)}`)
          }
        })
      } else {
        console.log('No worker execution logs found either')
      }
    }
    return
  }

  // Group logs by function
  const logsByFunction = logs.reduce((acc, log) => {
    const fn = log.function_name || 'unknown'
    if (!acc[fn]) acc[fn] = []
    acc[fn].push(log)
    return acc
  }, {} as Record<string, any[]>)

  // Display logs for each function
  for (const [functionName, functionLogs] of Object.entries(logsByFunction)) {
    console.log(`\n=== ${functionName} (${functionLogs.length} logs) ===`)
    
    // Count errors and successes
    const errors = functionLogs.filter(l => l.level === 'error' || l.status === 'error')
    const successes = functionLogs.filter(l => l.status === 'success')
    
    console.log(`Errors: ${errors.length}, Successes: ${successes.length}`)
    
    // Show recent errors
    if (errors.length > 0) {
      console.log('\nRecent errors:')
      errors.slice(0, 5).forEach(log => {
        console.log(`\n[${log.created_at}]`)
        console.log(`Error: ${log.error_message || log.message || 'No error message'}`)
        if (log.metadata) {
          console.log(`Details: ${JSON.stringify(log.metadata, null, 2)}`)
        }
      })
    }
    
    // Show recent successes
    if (successes.length > 0) {
      console.log('\nRecent successes:')
      successes.slice(0, 3).forEach(log => {
        console.log(`\n[${log.created_at}]`)
        if (log.metadata) {
          console.log(`Processed: ${JSON.stringify(log.metadata, null, 2)}`)
        }
      })
    }
  }

  // Check queue status
  console.log('\n\n=== Checking Queue Status ===')
  
  // Check memory ingestion queue
  const { data: memoryQueue } = await supabase.rpc('pgmq_read', {
    queue_name: 'memory_ingestion_queue',
    vt: 0,
    qty: 10
  })

  if (memoryQueue && memoryQueue.length > 0) {
    console.log(`\nMemory ingestion queue has ${memoryQueue.length} pending messages`)
  } else {
    console.log('\nMemory ingestion queue is empty')
  }

  // Check code ingestion queue
  const { data: codeQueue } = await supabase.rpc('pgmq_read', {
    queue_name: 'code_ingestion_queue',
    vt: 0,
    qty: 10
  })

  if (codeQueue && codeQueue.length > 0) {
    console.log(`Code ingestion queue has ${codeQueue.length} pending messages`)
  } else {
    console.log('Code ingestion queue is empty')
  }

  // Check if Neo4j functions are being called
  console.log('\n\n=== Checking Neo4j Function Calls ===')
  
  // Look for specific patterns in logs
  const neo4jPatterns = [
    'Neo4j',
    'neo4j',
    'ingest-memory-to-neo4j',
    'ingest-code-to-neo4j',
    'Creating Memory node',
    'Creating CodeEntity node'
  ]

  for (const pattern of neo4jPatterns) {
    const matches = logs.filter(l => 
      (l.message && l.message.includes(pattern)) ||
      (l.error_message && l.error_message.includes(pattern)) ||
      (l.function_name && l.function_name.includes(pattern))
    )
    
    if (matches.length > 0) {
      console.log(`\nFound ${matches.length} logs mentioning "${pattern}"`)
      matches.slice(0, 3).forEach(log => {
        console.log(`  [${log.created_at}] ${log.function_name}: ${log.message || log.error_message}`)
      })
    }
  }

  // Check for connection issues
  console.log('\n\n=== Checking for Connection Issues ===')
  
  const connectionErrors = logs.filter(l => 
    l.error_message && (
      l.error_message.includes('connection') ||
      l.error_message.includes('timeout') ||
      l.error_message.includes('ECONNREFUSED') ||
      l.error_message.includes('fetch failed')
    )
  )

  if (connectionErrors.length > 0) {
    console.log(`Found ${connectionErrors.length} connection-related errors:`)
    connectionErrors.forEach(log => {
      console.log(`\n[${log.created_at}] ${log.function_name}`)
      console.log(`Error: ${log.error_message}`)
    })
  } else {
    console.log('No connection errors found')
  }
}

// Run the check
checkIngestionLogs().catch(console.error)