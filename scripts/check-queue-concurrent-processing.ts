#!/usr/bin/env npx tsx

/**
 * Check if queue messages are being processed multiple times
 */

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkQueueConcurrentProcessing() {
  console.log('=== Checking Queue Concurrent Processing ===\n')

  // Check pgmq archive for duplicate processing
  const { data: archiveData, error: archiveError } = await supabase
    .rpc('pgmq_read_archive', {
      queue_name: 'pattern_detection',
      limit: 100
    })
    .gte('archived_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())

  if (archiveError) {
    console.log('Could not read archive, checking metrics instead...\n')
  } else if (archiveData && archiveData.length > 0) {
    console.log(`Found ${archiveData.length} archived messages\n`)
    
    // Group by message content to find duplicates
    const messageGroups = new Map<string, any[]>()
    
    archiveData.forEach((msg: any) => {
      const key = JSON.stringify(msg.message)
      if (!messageGroups.has(key)) {
        messageGroups.set(key, [])
      }
      messageGroups.get(key)!.push(msg)
    })
    
    // Find messages processed multiple times
    const duplicates = Array.from(messageGroups.entries())
      .filter(([_, msgs]) => msgs.length > 1)
    
    if (duplicates.length > 0) {
      console.log(`⚠️  Found ${duplicates.length} messages processed multiple times:\n`)
      duplicates.forEach(([msgContent, msgs]) => {
        const parsed = JSON.parse(msgContent)
        console.log(`Message: workspace=${parsed.workspace_id}, batch=${parsed.batch_id}`)
        console.log(`  Processed ${msgs.length} times`)
        msgs.forEach((m: any) => {
          console.log(`  - Archived at: ${m.archived_at}`)
        })
        console.log('')
      })
    }
  }

  // Check queue metrics
  console.log('=== Queue Metrics ===\n')
  
  const { data: metrics, error: metricsError } = await supabase
    .rpc('pgmq_metrics', { queue_name: 'pattern_detection' })

  if (!metricsError && metrics) {
    console.log('Pattern Detection Queue:')
    console.log(`  Queue length: ${metrics.queue_length || 0}`)
    console.log(`  Newest message age: ${metrics.newest_msg_age || 'N/A'}`)
    console.log(`  Oldest message age: ${metrics.oldest_msg_age || 'N/A'}`)
    console.log(`  Total messages: ${metrics.total_messages || 0}`)
    console.log('')
  }

  // Check for messages stuck in processing
  console.log('=== Checking for Stuck Messages ===\n')
  
  const { data: stuckMessages, error: stuckError } = await supabase
    .rpc('pgmq_peek', {
      queue_name: 'pattern_detection',
      quantity: 10
    })

  if (!stuckError && stuckMessages && stuckMessages.length > 0) {
    console.log(`Found ${stuckMessages.length} messages in queue:\n`)
    
    stuckMessages.forEach((msg: any) => {
      const age = Date.now() - new Date(msg.enqueued_at).getTime()
      const ageMinutes = Math.floor(age / 1000 / 60)
      
      if (ageMinutes > 5) {
        console.log(`⚠️  Old message (${ageMinutes} minutes):`)
      } else {
        console.log(`Message:`)
      }
      
      console.log(`  ID: ${msg.msg_id}`)
      console.log(`  Enqueued: ${msg.enqueued_at}`)
      console.log(`  Read count: ${msg.read_ct}`)
      console.log(`  Content: ${JSON.stringify(msg.message)}`)
      console.log('')
    })
  } else {
    console.log('No messages currently in queue\n')
  }

  // SQL queries for dashboard
  console.log('\n=== SQL Queries for Dashboard ===\n')
  
  console.log('1. Check pgmq tables directly:')
  console.log('```sql')
  console.log(`-- Check pattern_detection queue
SELECT * FROM pgmq.q_pattern_detection
ORDER BY enqueued_at DESC
LIMIT 20;

-- Check archive for duplicate processing
SELECT 
  message,
  COUNT(*) as process_count,
  MIN(archived_at) as first_processed,
  MAX(archived_at) as last_processed
FROM pgmq.a_pattern_detection
WHERE archived_at > NOW() - INTERVAL '1 hour'
GROUP BY message
HAVING COUNT(*) > 1
ORDER BY process_count DESC;

-- Check for concurrent reads
SELECT 
  msg_id,
  read_ct,
  enqueued_at,
  vt,
  message
FROM pgmq.q_pattern_detection
WHERE read_ct > 1
ORDER BY read_ct DESC;`)
  console.log('```\n')

  console.log('2. Check cron job execution:')
  console.log('```sql')
  console.log(`-- Check if multiple cron jobs are running
SELECT 
  jobname,
  schedule,
  active,
  jobid
FROM cron.job
WHERE command LIKE '%pattern-detection%'
   OR command LIKE '%memory-ingestion%';

-- Check recent cron executions
SELECT 
  jobid,
  jobname,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details
WHERE start_time > NOW() - INTERVAL '1 hour'
  AND jobname LIKE '%pattern%'
ORDER BY start_time DESC;`)
  console.log('```')
}

// Run the check
checkQueueConcurrentProcessing().catch(console.error)