#!/usr/bin/env npx tsx

/**
 * Check pattern detection execution timing to identify concurrent runs
 */

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkPatternExecutionTiming() {
  console.log('=== Checking Pattern Detection Execution Timing ===\n')

  // Check pattern_detection_logs for overlapping runs
  const { data: recentLogs, error: logsError } = await supabase
    .from('pattern_detection_logs')
    .select('*')
    .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()) // Last hour
    .order('created_at', { ascending: false })
    .limit(100)

  if (logsError) {
    console.error('Error fetching pattern detection logs:', logsError)
    return
  }

  if (!recentLogs || recentLogs.length === 0) {
    console.log('No recent pattern detection logs found')
    return
  }

  // Group by batch_id to see concurrent batches
  const batchGroups = new Map<string, any[]>()
  
  recentLogs.forEach(log => {
    const batchId = log.batch_id || 'no-batch'
    if (!batchGroups.has(batchId)) {
      batchGroups.set(batchId, [])
    }
    batchGroups.get(batchId)!.push(log)
  })

  console.log(`Found ${batchGroups.size} unique batches in the last hour\n`)

  // Analyze each batch
  const batches = Array.from(batchGroups.entries()).map(([batchId, logs]) => {
    const timestamps = logs.map(l => new Date(l.created_at).getTime())
    const workspaceIds = [...new Set(logs.map(l => l.workspace_id).filter(Boolean))]
    const userIds = [...new Set(logs.map(l => l.user_id).filter(Boolean))]
    
    return {
      batchId,
      startTime: new Date(Math.min(...timestamps)),
      endTime: new Date(Math.max(...timestamps)),
      duration: Math.max(...timestamps) - Math.min(...timestamps),
      logCount: logs.length,
      workspaceIds,
      userIds,
      status: logs.find(l => l.status)?.status || 'unknown',
      patternTypes: [...new Set(logs.map(l => l.pattern_type).filter(Boolean))]
    }
  }).sort((a, b) => b.startTime.getTime() - a.startTime.getTime())

  // Find overlapping batches
  console.log('=== Checking for Overlapping Batches ===\n')
  
  const overlaps: any[] = []
  
  for (let i = 0; i < batches.length; i++) {
    for (let j = i + 1; j < batches.length; j++) {
      const batch1 = batches[i]
      const batch2 = batches[j]
      
      // Check if time overlap and same workspace
      const sameWorkspace = batch1.workspaceIds.some(w => batch2.workspaceIds.includes(w))
      const timeOverlap = batch1.startTime <= batch2.endTime && batch2.startTime <= batch1.endTime
      
      if (sameWorkspace && timeOverlap) {
        overlaps.push({
          batch1: batch1.batchId,
          batch2: batch2.batchId,
          workspace: batch1.workspaceIds.filter(w => batch2.workspaceIds.includes(w))[0],
          overlapStart: new Date(Math.max(batch1.startTime.getTime(), batch2.startTime.getTime())),
          overlapEnd: new Date(Math.min(batch1.endTime.getTime(), batch2.endTime.getTime()))
        })
      }
    }
  }

  if (overlaps.length > 0) {
    console.log(`⚠️  Found ${overlaps.length} overlapping batch executions:\n`)
    overlaps.forEach((overlap, idx) => {
      console.log(`Overlap ${idx + 1}:`)
      console.log(`  Batch 1: ${overlap.batch1}`)
      console.log(`  Batch 2: ${overlap.batch2}`)
      console.log(`  Workspace: ${overlap.workspace}`)
      console.log(`  Overlap period: ${overlap.overlapStart.toISOString()} to ${overlap.overlapEnd.toISOString()}`)
      console.log('')
    })
  } else {
    console.log('✅ No overlapping batch executions found\n')
  }

  // Show recent batch details
  console.log('=== Recent Batch Details ===\n')
  
  batches.slice(0, 5).forEach(batch => {
    console.log(`Batch: ${batch.batchId}`)
    console.log(`  Start: ${batch.startTime.toISOString()}`)
    console.log(`  End: ${batch.endTime.toISOString()}`)
    console.log(`  Duration: ${(batch.duration / 1000).toFixed(2)}s`)
    console.log(`  Status: ${batch.status}`)
    console.log(`  Pattern Types: ${batch.patternTypes.join(', ') || 'none'}`)
    console.log(`  Workspaces: ${batch.workspaceIds.join(', ') || 'none'}`)
    console.log(`  Users: ${batch.userIds.join(', ') || 'none'}`)
    console.log('')
  })

  // Check pattern_processor_logs for EntitySummary creation
  console.log('=== Checking EntitySummary Creation Logs ===\n')
  
  const { data: processorLogs, error: processorError } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .or('message.ilike.%EntitySummary%,message.ilike.%entity summary%,message.ilike.%Creating summary%')
    .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(50)

  if (processorError) {
    console.error('Error fetching processor logs:', processorError)
    return
  }

  if (processorLogs && processorLogs.length > 0) {
    console.log(`Found ${processorLogs.length} EntitySummary-related logs:\n`)
    
    // Group by workspace and show patterns
    const summaryByWorkspace = new Map<string, any[]>()
    
    processorLogs.forEach(log => {
      const workspace = log.workspace_id || 'no-workspace'
      if (!summaryByWorkspace.has(workspace)) {
        summaryByWorkspace.set(workspace, [])
      }
      summaryByWorkspace.get(workspace)!.push(log)
    })

    summaryByWorkspace.forEach((logs, workspace) => {
      console.log(`Workspace ${workspace}:`)
      logs.slice(0, 5).forEach(log => {
        console.log(`  [${new Date(log.created_at).toISOString()}] ${log.message}`)
      })
      if (logs.length > 5) {
        console.log(`  ... and ${logs.length - 5} more logs`)
      }
      console.log('')
    })
  } else {
    console.log('No EntitySummary-related logs found in pattern_processor_logs\n')
  }

  // Check for rapid-fire pattern detection
  console.log('=== Checking for Rapid-Fire Pattern Detection ===\n')
  
  const batchesByWorkspace = new Map<string, any[]>()
  batches.forEach(batch => {
    batch.workspaceIds.forEach(workspace => {
      if (!batchesByWorkspace.has(workspace)) {
        batchesByWorkspace.set(workspace, [])
      }
      batchesByWorkspace.get(workspace)!.push(batch)
    })
  })

  batchesByWorkspace.forEach((workspaceBatches, workspace) => {
    if (workspaceBatches.length > 1) {
      // Sort by start time
      workspaceBatches.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
      
      // Check time between batches
      const intervals: number[] = []
      for (let i = 1; i < workspaceBatches.length; i++) {
        const interval = workspaceBatches[i].startTime.getTime() - workspaceBatches[i-1].endTime.getTime()
        intervals.push(interval)
      }
      
      const minInterval = Math.min(...intervals) / 1000
      if (minInterval < 60) { // Less than 1 minute between batches
        console.log(`⚠️  Workspace ${workspace}: Rapid pattern detection detected`)
        console.log(`  ${workspaceBatches.length} batches with minimum interval of ${minInterval.toFixed(2)}s`)
        console.log('')
      }
    }
  })
}

// Run the check
checkPatternExecutionTiming().catch(console.error)