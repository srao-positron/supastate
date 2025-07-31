#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkPatternLogs() {
  console.log('=== Checking Pattern Detection Logs ===\n')
  
  // Get recent logs related to pattern detection
  const { data: logs, error } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .or('message.ilike.%pattern%,message.ilike.%Pattern%')
    .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(50)
    
  if (error) {
    console.error('Error fetching logs:', error)
    return
  }
  
  if (!logs || logs.length === 0) {
    console.log('No pattern-related logs found')
    return
  }
  
  console.log(`Found ${logs.length} pattern-related logs:\n`)
  
  // Group by batch_id
  const byBatch = logs.reduce((acc, log) => {
    const batchId = log.batch_id || 'no-batch'
    if (!acc[batchId]) acc[batchId] = []
    acc[batchId].push(log)
    return acc
  }, {} as Record<string, any[]>)
  
  // Show latest batch first
  const sortedBatches = Object.entries(byBatch)
    .sort(([, a], [, b]) => {
      const aTime = new Date(a[0].created_at).getTime()
      const bTime = new Date(b[0].created_at).getTime()
      return bTime - aTime
    })
    .slice(0, 3) // Show only 3 most recent batches
  
  for (const [batchId, batchLogs] of sortedBatches) {
    console.log(`\n=== Batch: ${batchId} ===`)
    const startTime = new Date(batchLogs[batchLogs.length - 1].created_at)
    console.log(`Started: ${startTime.toLocaleTimeString()}`)
    
    for (const log of batchLogs) {
      const time = new Date(log.created_at).toLocaleTimeString()
      const relTime = ((new Date(log.created_at).getTime() - startTime.getTime()) / 1000).toFixed(1)
      console.log(`[+${relTime}s] [${log.level}] ${log.message}`)
      
      if (log.details && Object.keys(log.details).length > 0) {
        // Show key details
        if (log.details.patterns_found !== undefined) {
          console.log(`         Patterns found: ${log.details.patterns_found}`)
        }
        if (log.details.workspace_id) {
          console.log(`         Workspace: ${log.details.workspace_id}`)
        }
        if (log.details.error) {
          console.log(`         Error: ${log.details.error}`)
        }
      }
    }
  }
  
  // Check for any patterns in Neo4j
  console.log('\n=== Checking for Patterns in Neo4j ===')
  console.log('Run this script to check: npx tsx scripts/check-patterns.ts')
}

checkPatternLogs().catch(console.error)
