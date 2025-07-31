#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function testQueueSend() {
  console.log('=== Testing Queue Send ===\n')
  
  // Test sending to pattern detection queue using our wrapper function
  console.log('1. Sending test pattern detection job...')
  const { data: pdMsgId, error: pdError } = await supabase.rpc('queue_pattern_detection_job', {
    p_batch_id: crypto.randomUUID(),
    p_pattern_types: ['test'],
    p_limit: 10,
    p_workspace_id: 'user:test-user-id'
  })
  
  if (pdError) {
    console.error('❌ Pattern detection queue error:', pdError)
  } else {
    console.log('✅ Pattern detection job queued, message ID:', pdMsgId)
  }
  
  // Test sending to memory ingestion queue
  console.log('\n2. Sending test memory ingestion job...')
  const testMemoryId = crypto.randomUUID()
  const testUserId = 'a02c3fed-3a24-442f-becc-97bac8b75e90'
  
  const { data: miMsgId, error: miError } = await supabase.rpc('queue_memory_ingestion_job', {
    p_memory_id: testMemoryId,
    p_user_id: testUserId,
    p_content: 'Test memory content for queue system',
    p_workspace_id: `user:${testUserId}`,
    p_metadata: { test: true }
  })
  
  if (miError) {
    console.error('❌ Memory ingestion queue error:', miError)
  } else {
    console.log('✅ Memory ingestion job queued, message ID:', miMsgId)
  }
  
  // Check queue health
  console.log('\n3. Checking queue health...')
  const { data: health, error: healthError } = await supabase
    .from('queue_health')
    .select('*')
    
  if (healthError) {
    console.log('❌ Could not fetch queue health:', healthError.message)
  } else if (health && health.length > 0) {
    console.log('\nQueue Status:')
    for (const q of health) {
      console.log(`- ${q.queue_name}: ${q.queue_length || 0} messages`)
    }
  }
  
  // Try to manually trigger a worker
  console.log('\n4. Manually triggering memory ingestion worker...')
  try {
    const response = await fetch(
      'https://zqlfxakbkwssxfynrmnk.supabase.co/functions/v1/memory-ingestion-worker',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: '{}'
      }
    )
    
    console.log('Worker response status:', response.status)
    if (response.ok) {
      const text = await response.text()
      console.log('Worker response:', text || '(empty)')
    } else {
      console.error('Worker error:', await response.text())
    }
  } catch (e) {
    console.error('Failed to trigger worker:', e)
  }
  
  // Check logs after a short delay
  console.log('\n5. Waiting 3 seconds then checking logs...')
  await new Promise(resolve => setTimeout(resolve, 3000))
  
  const { data: logs } = await supabase
    .from('pattern_processor_logs')
    .select('created_at, level, message')
    .gte('created_at', new Date(Date.now() - 60000).toISOString())
    .order('created_at', { ascending: false })
    .limit(20)
    
  if (logs && logs.length > 0) {
    console.log('\nRecent logs:')
    for (const log of logs) {
      const time = new Date(log.created_at).toLocaleTimeString()
      console.log(`[${time}] [${log.level}] ${log.message}`)
    }
  } else {
    console.log('No recent logs found')
  }
}

testQueueSend().catch(console.error)