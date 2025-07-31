#!/usr/bin/env npx tsx

/**
 * Check for concurrent EntitySummary creation that could cause duplicates
 */

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkConcurrentSummaries() {
  console.log('=== Checking for Concurrent EntitySummary Creation ===\n')

  // First, check pattern_processor_logs for timing
  const { data: logs, error } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()) // Last hour
    .order('created_at', { ascending: false })
    .limit(1000)

  if (error) {
    console.error('Error fetching logs:', error)
    return
  }

  if (!logs || logs.length === 0) {
    console.log('No recent pattern processor logs found')
    return
  }

  // Group logs by batch_id
  const batchMap = new Map<string, any[]>()
  
  logs.forEach(log => {
    const batchId = log.batch_id || 'no-batch'
    if (!batchMap.has(batchId)) {
      batchMap.set(batchId, [])
    }
    batchMap.get(batchId)!.push(log)
  })

  console.log(`Found ${batchMap.size} unique batches in the last hour\n`)

  // Analyze batches for timing
  const batches = Array.from(batchMap.entries()).map(([batchId, batchLogs]) => {
    const timestamps = batchLogs.map(l => new Date(l.created_at).getTime())
    const startTime = Math.min(...timestamps)
    const endTime = Math.max(...timestamps)
    
    // Look for summary-related messages
    const summaryLogs = batchLogs.filter(l => 
      l.message?.toLowerCase().includes('summary') ||
      l.message?.toLowerCase().includes('entitysummary')
    )
    
    // Get unique workspaces and users
    const workspaces = [...new Set(batchLogs.map(l => l.workspace_id).filter(Boolean))]
    const users = [...new Set(batchLogs.map(l => l.user_id).filter(Boolean))]
    
    return {
      batchId,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      duration: (endTime - startTime) / 1000,
      logCount: batchLogs.length,
      summaryLogCount: summaryLogs.length,
      workspaces,
      users,
      logs: batchLogs
    }
  }).filter(b => b.summaryLogCount > 0 || b.logCount > 50) // Focus on batches with summaries or many logs

  // Sort by start time
  batches.sort((a, b) => b.startTime.getTime() - a.startTime.getTime())

  // Check for overlapping batches
  console.log('=== Checking for Overlapping Pattern Detection Runs ===\n')
  
  const overlaps: any[] = []
  
  for (let i = 0; i < batches.length; i++) {
    for (let j = i + 1; j < batches.length; j++) {
      const batch1 = batches[i]
      const batch2 = batches[j]
      
      // Check time overlap
      if (batch1.startTime <= batch2.endTime && batch2.startTime <= batch1.endTime) {
        // Check if they share workspaces
        const sharedWorkspaces = batch1.workspaces.filter(w => batch2.workspaces.includes(w))
        
        if (sharedWorkspaces.length > 0) {
          overlaps.push({
            batch1: batch1.batchId,
            batch2: batch2.batchId,
            sharedWorkspaces,
            overlapDuration: Math.min(batch1.endTime.getTime(), batch2.endTime.getTime()) - 
                            Math.max(batch1.startTime.getTime(), batch2.startTime.getTime()),
            batch1Start: batch1.startTime,
            batch2Start: batch2.startTime
          })
        }
      }
    }
  }

  if (overlaps.length > 0) {
    console.log(`⚠️  Found ${overlaps.length} overlapping pattern detection runs:\n`)
    overlaps.forEach((overlap, idx) => {
      console.log(`Overlap ${idx + 1}:`)
      console.log(`  Batch 1: ${overlap.batch1} (started ${overlap.batch1Start.toISOString()})`)
      console.log(`  Batch 2: ${overlap.batch2} (started ${overlap.batch2Start.toISOString()})`)
      console.log(`  Shared workspaces: ${overlap.sharedWorkspaces.join(', ')}`)
      console.log(`  Overlap duration: ${(overlap.overlapDuration / 1000).toFixed(2)}s`)
      console.log('')
    })
  } else {
    console.log('✅ No overlapping pattern detection runs found\n')
  }

  // Show batches that created summaries
  console.log('=== Batches with EntitySummary Operations ===\n')
  
  const summaryBatches = batches.filter(b => b.summaryLogCount > 0)
  
  if (summaryBatches.length > 0) {
    summaryBatches.slice(0, 5).forEach(batch => {
      console.log(`Batch: ${batch.batchId}`)
      console.log(`  Time: ${batch.startTime.toISOString()} (${batch.duration.toFixed(2)}s)`)
      console.log(`  Workspaces: ${batch.workspaces.join(', ') || 'none'}`)
      console.log(`  Summary operations: ${batch.summaryLogCount}`)
      
      // Show summary-related logs
      const summaryLogs = batch.logs.filter(l => 
        l.message?.toLowerCase().includes('summary') ||
        l.message?.toLowerCase().includes('entitysummary')
      )
      
      summaryLogs.slice(0, 3).forEach(log => {
        console.log(`    - ${log.message}`)
      })
      
      console.log('')
    })
  } else {
    console.log('No batches with EntitySummary operations found\n')
  }

  // Check for rapid succession of pattern detection
  console.log('=== Checking Pattern Detection Frequency ===\n')
  
  // Group by workspace
  const workspaceBatches = new Map<string, any[]>()
  
  batches.forEach(batch => {
    batch.workspaces.forEach(workspace => {
      if (!workspaceBatches.has(workspace)) {
        workspaceBatches.set(workspace, [])
      }
      workspaceBatches.get(workspace)!.push(batch)
    })
  })

  workspaceBatches.forEach((wBatches, workspace) => {
    if (wBatches.length > 1) {
      // Sort by start time
      wBatches.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
      
      // Calculate intervals
      const intervals: number[] = []
      for (let i = 1; i < wBatches.length; i++) {
        const interval = (wBatches[i].startTime.getTime() - wBatches[i-1].endTime.getTime()) / 1000
        intervals.push(interval)
      }
      
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
      const minInterval = Math.min(...intervals)
      
      if (minInterval < 30) { // Less than 30 seconds between runs
        console.log(`⚠️  Workspace ${workspace}:`)
        console.log(`  ${wBatches.length} pattern detection runs`)
        console.log(`  Minimum interval: ${minInterval.toFixed(2)}s`)
        console.log(`  Average interval: ${avgInterval.toFixed(2)}s`)
        console.log('')
      }
    }
  })

  // SQL queries to run in dashboard
  console.log('\n=== SQL Queries to Run in Supabase Dashboard ===\n')
  
  console.log('1. Check for concurrent function executions:')
  console.log('```sql')
  console.log(`-- Look for overlapping memory-ingestion-worker executions
WITH execution_windows AS (
  SELECT 
    metadata->>'execution_id' as execution_id,
    metadata->>'function_id' as function_name,
    MIN(timestamp) as start_time,
    MAX(timestamp) as end_time,
    COUNT(*) as log_count
  FROM function_logs
  CROSS JOIN unnest(metadata) as metadata
  WHERE metadata->>'function_id' IN ('memory-ingestion-worker', 'pattern-detection-coordinator')
    AND timestamp > (EXTRACT(EPOCH FROM NOW() - INTERVAL '1 hour') * 1000000)
  GROUP BY metadata->>'execution_id', metadata->>'function_id'
)
SELECT 
  ew1.function_name,
  ew1.execution_id as exec1,
  ew2.execution_id as exec2,
  to_timestamp(ew1.start_time/1000000) as exec1_start,
  to_timestamp(ew2.start_time/1000000) as exec2_start
FROM execution_windows ew1
JOIN execution_windows ew2 
  ON ew1.function_name = ew2.function_name
  AND ew1.execution_id < ew2.execution_id
WHERE ew1.start_time <= ew2.end_time 
  AND ew2.start_time <= ew1.end_time
ORDER BY ew1.start_time DESC;`)
  console.log('```\n')

  console.log('2. Check for EntitySummary creation messages:')
  console.log('```sql')
  console.log(`-- Find EntitySummary creation logs
SELECT 
  to_timestamp(timestamp/1000000) as log_time,
  metadata->>'function_id' as function_name,
  metadata->>'execution_id' as execution_id,
  event_message
FROM function_logs
CROSS JOIN unnest(metadata) as metadata
WHERE (
  event_message ILIKE '%EntitySummary%' 
  OR event_message ILIKE '%Creating summary%'
  OR event_message ILIKE '%Summary created%'
)
  AND timestamp > (EXTRACT(EPOCH FROM NOW() - INTERVAL '1 hour') * 1000000)
ORDER BY timestamp DESC
LIMIT 50;`)
  console.log('```')
}

// Run the check
checkConcurrentSummaries().catch(console.error)