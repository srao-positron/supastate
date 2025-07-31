#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

// Test with the exact format Camille uses
async function testCamilleMemoryFormat() {
  console.log('=== Testing Camille Memory Format ===\n')
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  
  // Simulate Camille's exact request format
  const camilleRequest = {
    projectName: "test-project",
    teamId: undefined,
    chunks: [
      {
        sessionId: "camille-session-123",
        chunkId: "chunk-" + Date.now(),
        content: "Testing Camille integration with the new queue system. This is how Camille sends memory chunks.",
        metadata: {
          projectName: "test-project",
          timestamp: new Date().toISOString(),
          source: "camille"
        }
      }
    ]
  }
  
  console.log('1. Calling ingest-memory edge function with Camille format...')
  const response = await fetch(
    `${supabaseUrl}/functions/v1/ingest-memory`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(camilleRequest)
    }
  )
  
  if (response.ok) {
    const result = await response.json()
    console.log('✅ Response:', result)
  } else {
    console.error('❌ Failed:', response.status, await response.text())
  }
  
  // Wait a moment then trigger the worker
  console.log('\n2. Waiting 3 seconds...')
  await new Promise(resolve => setTimeout(resolve, 3000))
  
  console.log('\n3. Triggering memory ingestion worker...')
  const workerResponse = await fetch(
    `${supabaseUrl}/functions/v1/memory-ingestion-worker`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      },
      body: '{}'
    }
  )
  
  if (workerResponse.ok) {
    const workerResult = await workerResponse.json()
    console.log('✅ Worker result:', workerResult)
  } else {
    console.error('❌ Worker failed:', await workerResponse.text())
  }
  
  console.log('\n✅ Test complete!')
  console.log('\nNotes:')
  console.log('- The ingest-memory edge function now uses pgmq queues')
  console.log('- Memory is saved to Supabase then queued for Neo4j ingestion')
  console.log('- Pattern detection is triggered automatically after ingestion')
  console.log('- Camille can continue using the same API without changes')
}

testCamilleMemoryFormat().catch(console.error)