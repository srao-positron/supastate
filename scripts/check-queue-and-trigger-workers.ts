#!/usr/bin/env npx tsx

/**
 * Check queue status and trigger workers if needed
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkAndTrigger() {
  console.log('=== Checking Queue Status ===\n')

  // Check memory queue
  const { data: memoryMetrics } = await supabase.rpc('pgmq_metrics', {
    queue_name: 'memory_ingestion_queue'
  })
  
  console.log('Memory Ingestion Queue:')
  console.log(`  Queue Length: ${memoryMetrics?.queue_length || 0}`)
  console.log(`  Total Messages: ${memoryMetrics?.total_messages || 0}`)

  // Check code queue
  const { data: codeMetrics } = await supabase.rpc('pgmq_metrics', {
    queue_name: 'code_ingestion_queue'
  })
  
  console.log('\nCode Ingestion Queue:')
  console.log(`  Queue Length: ${codeMetrics?.queue_length || 0}`)
  console.log(`  Total Messages: ${codeMetrics?.total_messages || 0}`)

  // Check pattern detection queue
  const { data: patternMetrics } = await supabase.rpc('pgmq_metrics', {
    queue_name: 'pattern_detection_queue'
  })
  
  console.log('\nPattern Detection Queue:')
  console.log(`  Queue Length: ${patternMetrics?.queue_length || 0}`)
  console.log(`  Total Messages: ${patternMetrics?.total_messages || 0}`)

  // Trigger workers if queues have messages
  console.log('\n\n=== Triggering Workers ===\n')

  if (memoryMetrics?.queue_length > 0) {
    console.log('Triggering memory-ingestion-worker...')
    const { error } = await supabase.functions.invoke('memory-ingestion-worker')
    if (error) {
      console.error('Error:', error)
    } else {
      console.log('Success!')
    }
  }

  if (codeMetrics?.queue_length > 0) {
    console.log('Triggering code-ingestion-worker...')
    const { error } = await supabase.functions.invoke('code-ingestion-worker')
    if (error) {
      console.error('Error:', error)
    } else {
      console.log('Success!')
    }
  }

  if (patternMetrics?.queue_length > 0) {
    console.log('Triggering pattern-detection-worker...')
    const { error } = await supabase.functions.invoke('pattern-detection-worker')
    if (error) {
      console.error('Error:', error)
    } else {
      console.log('Success!')
    }
  }

  // Check cron job status
  console.log('\n\n=== Checking Cron Jobs ===\n')
  
  const { data: cronJobs, error: cronError } = await supabase
    .from('cron.job')
    .select('*')
    .in('jobname', [
      'memory-ingestion-coordinator-cron',
      'code-ingestion-coordinator-cron',
      'pattern-detection-coordinator-cron'
    ])

  if (cronError) {
    console.error('Error fetching cron jobs:', cronError)
  } else if (cronJobs) {
    cronJobs.forEach(job => {
      console.log(`${job.jobname}:`)
      console.log(`  Schedule: ${job.schedule}`)
      console.log(`  Active: ${job.active}`)
      console.log(`  Next run: ${job.nextrun}`)
      console.log('')
    })
  }
}

checkAndTrigger().catch(console.error)