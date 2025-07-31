#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

async function testMemoryQueueDirect() {
  console.log('=== Testing Memory Queue Directly ===\n')
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  // First, create a memory in the database
  console.log('1. Creating memory in database...')
  const memoryData = {
    content: "Testing the queue-based memory ingestion system. This is a test memory created to verify the basic flow is working.",
    project_name: "test-project",
    chunk_id: "test-chunk-" + Date.now(),
    type: "experience",
    user_id: "a02c3fed-3a24-442f-becc-97bac8b75e90", // srao@positronnetworks.com
    team_id: null, // No team, just user
    metadata: {
      source: "test-script",
      timestamp: new Date().toISOString()
    }
  }
  
  const { data: memory, error: memoryError } = await supabase
    .from('memories')
    .insert(memoryData)
    .select()
    .single()
    
  if (memoryError || !memory) {
    console.error('❌ Failed to create memory:', memoryError)
    return
  }
  
  console.log('✅ Memory created:', {
    id: memory.id,
    project_name: memory.project_name,
    created_at: memory.created_at
  })
  
  // Queue it for ingestion
  console.log('\n2. Queueing memory for ingestion...')
  const workspaceId = memory.team_id ? `team:${memory.team_id}` : `user:${memory.user_id}`
  const { data: msgId, error: queueError } = await supabase.rpc('queue_memory_ingestion_job', {
    p_memory_id: memory.id,
    p_user_id: memory.user_id,
    p_content: memory.content,
    p_workspace_id: workspaceId,
    p_metadata: memory.metadata || {}
  })
  
  if (queueError) {
    console.error('❌ Failed to queue memory:', queueError)
    return
  }
  
  console.log('✅ Memory queued with message ID:', msgId)
  
  // Wait a moment then trigger the worker
  console.log('\n3. Waiting 2 seconds then triggering worker...')
  await new Promise(resolve => setTimeout(resolve, 2000))
  
  const workerResponse = await fetch(
    'https://zqlfxakbkwssxfynrmnk.supabase.co/functions/v1/memory-ingestion-worker',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: '{}'
    }
  )
  
  if (workerResponse.ok) {
    const workerResult = await workerResponse.json()
    console.log('✅ Worker response:', workerResult)
  } else {
    console.error('❌ Worker error:', await workerResponse.text())
  }
  
  // Check if pattern detection was triggered
  console.log('\n4. Checking if pattern detection was queued...')
  const { data: patternJobs } = await supabase.rpc('pgmq_read', {
    queue_name: 'pattern_detection',
    vt: 0, // Don't lock, just peek
    qty: 10
  })
  
  console.log('Pattern queue messages:', patternJobs || [])
  
  // Check logs
  console.log('\n5. Checking logs...')
  const { data: logs } = await supabase
    .from('pattern_processor_logs')
    .select('created_at, level, message')
    .gte('created_at', new Date(Date.now() - 120000).toISOString())
    .or('message.ilike.%memory%,message.ilike.%Memory%,message.ilike.%ingestion%')
    .order('created_at', { ascending: false })
    .limit(10)
    
  if (logs && logs.length > 0) {
    console.log('\nRecent memory-related logs:')
    for (const log of logs) {
      const time = new Date(log.created_at).toLocaleTimeString()
      console.log(`[${time}] [${log.level}] ${log.message}`)
    }
  } else {
    console.log('No recent memory logs found')
  }
  
  console.log('\n✅ Direct memory queue test complete!')
}

testMemoryQueueDirect().catch(console.error)