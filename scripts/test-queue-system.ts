#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function testQueueSystem() {
  console.log('=== Testing Queue System ===\n')
  
  // Test 1: Try to send a test message to pattern detection queue
  console.log('1. Testing pattern detection queue...')
  try {
    const { data: msgId, error } = await supabase.rpc('queue_pattern_detection_job', {
      p_batch_id: crypto.randomUUID(),
      p_pattern_types: ['debugging'],
      p_limit: 10,
      p_workspace_id: 'user:test'
    })
    
    if (error) {
      console.error('❌ Failed to queue pattern detection:', error.message)
    } else {
      console.log('✅ Pattern detection queued successfully, message ID:', msgId)
    }
  } catch (e) {
    console.error('❌ Exception queuing pattern detection:', e)
  }
  
  // Test 2: Try to send a test memory ingestion message
  console.log('\n2. Testing memory ingestion queue...')
  try {
    const testMemoryId = crypto.randomUUID()
    const { data: msgId, error } = await supabase.rpc('queue_memory_ingestion_job', {
      p_memory_id: testMemoryId,
      p_user_id: 'a02c3fed-3a24-442f-becc-97bac8b75e90',
      p_content: 'Test memory for queue system',
      p_workspace_id: 'user:a02c3fed-3a24-442f-becc-97bac8b75e90',
      p_metadata: {}
    })
    
    if (error) {
      console.error('❌ Failed to queue memory ingestion:', error.message)
    } else {
      console.log('✅ Memory ingestion queued successfully, message ID:', msgId)
    }
  } catch (e) {
    console.error('❌ Exception queuing memory ingestion:', e)
  }
  
  // Test 3: Check if workers picked up the messages
  console.log('\n3. Waiting 5 seconds for workers to process...')
  await new Promise(resolve => setTimeout(resolve, 5000))
  
  // Check recent logs
  console.log('\n4. Checking worker logs...')
  const { data: logs, error: logError } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .gte('created_at', new Date(Date.now() - 2 * 60 * 1000).toISOString())
    .in('message', [
      'Memory ingestion worker started',
      'Pattern detection worker started',
      'Processing pattern detection job',
      'Processing memory'
    ])
    .order('created_at', { ascending: false })
    .limit(10)
    
  if (logs && logs.length > 0) {
    console.log('\nRecent worker activity:')
    for (const log of logs) {
      const time = new Date(log.created_at).toLocaleTimeString()
      console.log(`[${time}] ${log.message}`)
    }
  } else {
    console.log('❌ No worker activity found')
  }
  
  // Test 4: Check cron jobs
  console.log('\n5. Checking active cron jobs...')
  try {
    const { data: jobs, error: cronError } = await supabase
      .from('cron.job')
      .select('jobname, schedule, active')
      .eq('active', true)
    
    if (jobs && jobs.length > 0) {
      console.log('\nActive cron jobs:')
      for (const job of jobs) {
        console.log(`- ${job.jobname}: ${job.schedule}`)
      }
    }
  } catch (e) {
    console.log('Could not check cron jobs')
  }
}

testQueueSystem().catch(console.error)