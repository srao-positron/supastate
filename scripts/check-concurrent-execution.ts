#!/usr/bin/env npx tsx

/**
 * Check for concurrent execution of edge functions that could cause duplicate EntitySummary nodes
 */

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkConcurrentExecution() {
  console.log('=== Checking for Concurrent Function Execution ===\n')

  // SQL query to check function logs using the analytics API
  const sql = `
    -- Find overlapping executions of memory-ingestion-worker
    WITH memory_worker_logs AS (
      SELECT 
        id,
        timestamp,
        event_message,
        metadata->>'execution_id' as execution_id,
        metadata->>'function_id' as function_id,
        metadata->>'level' as level,
        timestamp as ts_numeric
      FROM edge_logs
      WHERE metadata->>'function_id' IN (
        'memory-ingestion-worker',
        'pattern-detection-coordinator',
        'pattern-processor',
        'smart-pattern-detection'
      )
        AND timestamp > NOW() - INTERVAL '30 minutes'
      ORDER BY timestamp DESC
    ),
    execution_windows AS (
      SELECT 
        execution_id,
        metadata->>'function_id' as function_name,
        MIN(timestamp) as start_time,
        MAX(timestamp) as end_time,
        COUNT(*) as log_count,
        array_agg(event_message ORDER BY timestamp) as messages
      FROM edge_logs
      WHERE metadata->>'execution_id' IS NOT NULL
        AND metadata->>'function_id' IN (
          'memory-ingestion-worker',
          'pattern-detection-coordinator',
          'pattern-processor',
          'smart-pattern-detection'
        )
        AND timestamp > NOW() - INTERVAL '30 minutes'
      GROUP BY execution_id, metadata->>'function_id'
    )
    SELECT 
      ew1.function_name,
      ew1.execution_id as exec1,
      ew2.execution_id as exec2,
      ew1.start_time as exec1_start,
      ew1.end_time as exec1_end,
      ew2.start_time as exec2_start,
      ew2.end_time as exec2_end,
      CASE 
        WHEN ew1.start_time <= ew2.end_time AND ew2.start_time <= ew1.end_time 
        THEN 'OVERLAPPING'
        ELSE 'SEQUENTIAL'
      END as overlap_status
    FROM execution_windows ew1
    JOIN execution_windows ew2 
      ON ew1.function_name = ew2.function_name
      AND ew1.execution_id < ew2.execution_id
    WHERE ew1.start_time <= ew2.end_time 
      AND ew2.start_time <= ew1.end_time
    ORDER BY ew1.start_time DESC
    LIMIT 20;
  `

  // Alternative approach using Supabase logs table if available
  console.log('Checking edge_logs table for concurrent executions...\n')

  try {
    // First, let's check if we can access edge logs
    const { data: recentLogs, error: logsError } = await supabase
      .from('edge_logs')
      .select('*')
      .in('metadata->function_id', [
        'memory-ingestion-worker',
        'pattern-detection-coordinator',
        'pattern-processor',
        'smart-pattern-detection'
      ])
      .gte('timestamp', new Date(Date.now() - 30 * 60 * 1000).toISOString())
      .order('timestamp', { ascending: false })
      .limit(500)

    if (logsError) {
      console.log('Edge logs table not accessible, trying alternative approach...\n')
      
      // Check function logs using a different approach
      console.log('SQL Query to run in Supabase Dashboard:\n')
      console.log('```sql')
      console.log(`-- Check for concurrent executions
SELECT 
  timestamp,
  event_message,
  metadata.function_id as function_name,
  metadata.execution_id as execution_id
FROM function_logs
CROSS JOIN unnest(metadata) as metadata
WHERE metadata.function_id IN (
  'memory-ingestion-worker',
  'pattern-detection-coordinator',
  'pattern-processor',
  'smart-pattern-detection'
)
  AND function_logs.timestamp >= ${Date.now() - 30 * 60 * 1000} * 1000
ORDER BY timestamp DESC
LIMIT 100;`)
      console.log('```\n')

      console.log('Also check for EntitySummary creation logs:')
      console.log('```sql')
      console.log(`-- Look for EntitySummary creation messages
SELECT 
  timestamp,
  event_message
FROM function_logs
CROSS JOIN unnest(metadata) as metadata
WHERE event_message ILIKE '%EntitySummary%'
  OR event_message ILIKE '%entity summary%'
  OR event_message ILIKE '%Creating summary%'
  OR event_message ILIKE '%Summary created%'
ORDER BY timestamp DESC
LIMIT 50;`)
      console.log('```\n')
      
      return
    }

    if (!recentLogs || recentLogs.length === 0) {
      console.log('No recent logs found for the specified functions\n')
      return
    }

    // Group logs by execution ID and function
    const executionGroups = new Map<string, any[]>()
    
    recentLogs.forEach(log => {
      const execId = log.metadata?.execution_id || 'no-exec-id'
      const funcName = log.metadata?.function_id || log.metadata?.function_name || 'unknown'
      const key = `${funcName}:${execId}`
      
      if (!executionGroups.has(key)) {
        executionGroups.set(key, [])
      }
      executionGroups.get(key)!.push(log)
    })

    // Find overlapping executions
    const executions = Array.from(executionGroups.entries()).map(([key, logs]) => {
      const [funcName, execId] = key.split(':')
      const timestamps = logs.map(l => new Date(l.timestamp).getTime())
      return {
        function: funcName,
        executionId: execId,
        startTime: Math.min(...timestamps),
        endTime: Math.max(...timestamps),
        logCount: logs.length,
        logs: logs
      }
    })

    // Check for overlaps
    console.log('=== Checking for Overlapping Executions ===\n')
    
    const overlaps: any[] = []
    
    for (let i = 0; i < executions.length; i++) {
      for (let j = i + 1; j < executions.length; j++) {
        const exec1 = executions[i]
        const exec2 = executions[j]
        
        // Check if same function and time overlap
        if (exec1.function === exec2.function &&
            exec1.startTime <= exec2.endTime &&
            exec2.startTime <= exec1.endTime) {
          overlaps.push({
            function: exec1.function,
            exec1: exec1.executionId,
            exec2: exec2.executionId,
            overlap: {
              start: Math.max(exec1.startTime, exec2.startTime),
              end: Math.min(exec1.endTime, exec2.endTime)
            }
          })
        }
      }
    }

    if (overlaps.length > 0) {
      console.log(`Found ${overlaps.length} overlapping executions:\n`)
      overlaps.forEach(overlap => {
        console.log(`Function: ${overlap.function}`)
        console.log(`Execution 1: ${overlap.exec1}`)
        console.log(`Execution 2: ${overlap.exec2}`)
        console.log(`Overlap period: ${new Date(overlap.overlap.start).toISOString()} to ${new Date(overlap.overlap.end).toISOString()}`)
        console.log('---')
      })
    } else {
      console.log('No overlapping executions found\n')
    }

    // Look for EntitySummary creation patterns
    console.log('\n=== EntitySummary Creation Patterns ===\n')
    
    const summaryLogs = recentLogs.filter(log => 
      log.event_message?.toLowerCase().includes('entitysummary') ||
      log.event_message?.toLowerCase().includes('entity summary') ||
      log.event_message?.toLowerCase().includes('creating summary') ||
      log.event_message?.toLowerCase().includes('summary created')
    )

    if (summaryLogs.length > 0) {
      console.log(`Found ${summaryLogs.length} logs related to EntitySummary:\n`)
      
      // Group by execution to see patterns
      const summaryByExec = new Map<string, any[]>()
      summaryLogs.forEach(log => {
        const execId = log.metadata?.execution_id || 'no-exec-id'
        if (!summaryByExec.has(execId)) {
          summaryByExec.set(execId, [])
        }
        summaryByExec.get(execId)!.push(log)
      })

      summaryByExec.forEach((logs, execId) => {
        console.log(`Execution ${execId}:`)
        logs.forEach(log => {
          console.log(`  [${new Date(log.timestamp).toISOString()}] ${log.event_message}`)
        })
        console.log('')
      })
    } else {
      console.log('No EntitySummary-related logs found\n')
    }

  } catch (error) {
    console.error('Error checking logs:', error)
  }
}

// Run the check
checkConcurrentExecution().catch(console.error)