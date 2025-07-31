#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function testQueuesDirectly() {
  console.log('=== Testing Queues Directly ===\n')
  
  // Test 1: Send message directly via pgmq.send
  console.log('1. Testing direct pgmq.send to pattern_detection queue...')
  try {
    const { data, error } = await supabase.rpc('pgmq.send', {
      queue_name: 'pattern_detection',
      msg: {
        batch_id: crypto.randomUUID(),
        pattern_types: ['test'],
        limit: 10,
        workspace_id: 'user:test',
        created_at: new Date().toISOString()
      }
    })
    
    if (error) {
      console.error('❌ Failed:', error.message)
    } else {
      console.log('✅ Message sent successfully, ID:', data)
    }
  } catch (e) {
    console.error('❌ Exception:', e)
  }
  
  // Test 2: Read messages from queue
  console.log('\n2. Reading messages from pattern_detection queue...')
  try {
    const { data, error } = await supabase.rpc('pgmq.read', {
      queue_name: 'pattern_detection',
      vt: 0,  // visibility timeout 0 = just peek
      qty: 5  // read up to 5 messages
    })
    
    if (error) {
      console.error('❌ Failed to read:', error.message)
    } else {
      console.log('Messages in queue:', data?.length || 0)
      if (data && data.length > 0) {
        console.log('First message:', JSON.stringify(data[0], null, 2))
      }
    }
  } catch (e) {
    console.error('❌ Exception:', e)
  }
  
  // Test 3: Check queue metrics
  console.log('\n3. Checking queue metrics...')
  try {
    const { data, error } = await supabase.rpc('pgmq.metrics', {
      queue_name: 'pattern_detection'
    })
    
    if (error) {
      console.error('❌ Failed to get metrics:', error.message)
    } else {
      console.log('Queue metrics:', data)
    }
  } catch (e) {
    console.error('❌ Exception:', e)
  }
  
  // Test 4: Check cron jobs
  console.log('\n4. Checking cron jobs...')
  const { data: jobs } = await supabase
    .from('cron.job')
    .select('jobname, schedule, active, command')
    .eq('active', true)
    
  if (jobs && jobs.length > 0) {
    console.log('\nActive cron jobs:')
    for (const job of jobs) {
      console.log(`- ${job.jobname}: ${job.schedule}`)
      console.log(`  Command: ${job.command}`)
    }
  } else {
    console.log('No active cron jobs found')
  }
}

testQueuesDirectly().catch(console.error)