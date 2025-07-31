#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

async function testBasicIngestion() {
  console.log('=== Testing Basic Memory Ingestion ===\n')
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  
  const supabase = createClient(supabaseUrl, serviceKey)
  
  // First check queues
  const { data: queueMessages } = await supabase.rpc('pgmq_read', {
    queue_name: 'memory_ingestion',
    vt: 0,
    qty: 10
  })
  
  console.log(`Messages in memory_ingestion queue: ${queueMessages?.length || 0}`)
  
  // Try to enqueue a test memory
  console.log('\nEnqueuing test memory...')
  
  const testMemory = {
    content: 'Test memory created at ' + new Date().toISOString(),
    user_id: 'a02c3fed-3a24-442f-becc-97bac8b75e90',
    project_name: 'test-project',
    chunk_id: 'test-chunk-' + Date.now(),
    session_id: 'test-session-' + Date.now(),
    type: 'general',
    occurred_at: new Date().toISOString()
  }
  
  // Enqueue memory
  const { data, error } = await supabase.rpc('pgmq_send', {
    queue_name: 'memory_ingestion',
    msg: testMemory,
    delay: 0
  })
  
  if (error) {
    console.error('Failed to enqueue memory:', error)
  } else {
    console.log('✅ Memory enqueued successfully')
    console.log('Message ID:', data)
  }
  
  // Check queue again
  const { data: afterMessages } = await supabase.rpc('pgmq_read', {
    queue_name: 'memory_ingestion',
    vt: 0,
    qty: 10
  })
  
  console.log(`\nMessages in queue after enqueue: ${afterMessages?.length || 0}`)
  
  // Test the ingest-memory edge function directly
  console.log('\nTesting ingest-memory edge function...')
  
  const response = await fetch(`${supabaseUrl}/functions/v1/ingest-memory`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      memories: [{
        content: 'Direct test memory ' + new Date().toISOString(),
        user_id: 'a02c3fed-3a24-442f-becc-97bac8b75e90',
        project_name: 'test-project',
        chunk_id: 'direct-chunk-' + Date.now(),
        session_id: 'direct-session-' + Date.now(),
        type: 'general',
        occurred_at: new Date().toISOString()
      }]
    })
  })
  
  const result = await response.json()
  
  if (response.ok) {
    console.log('✅ Edge function response:', result)
  } else {
    console.log('❌ Edge function error:', result)
  }
  
  // Check memories table
  const { count: memCount } = await supabase
    .from('memories')
    .select('*', { count: 'exact', head: true })
    
  console.log(`\nTotal memories in database: ${memCount}`)
}

testBasicIngestion().catch(console.error)