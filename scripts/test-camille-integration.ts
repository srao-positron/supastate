#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

// Simulate what Camille does when calling the APIs
async function simulateCamilleIngestion() {
  console.log('=== Simulating Camille API Calls ===\n')
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  
  // 1. Test Memory Ingestion (what Camille does)
  console.log('1. Testing Memory Ingestion (edge function)...')
  const memoryResponse = await fetch(
    `${supabaseUrl}/functions/v1/ingest-memory`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: 'a02c3fed-3a24-442f-becc-97bac8b75e90',
        project_name: 'test-project',
        chunk_id: `camille-test-${Date.now()}`,
        content: 'This is a test memory from Camille integration test. Testing the queue-based system.',
        type: 'experience',
        metadata: {
          source: 'camille',
          timestamp: new Date().toISOString()
        }
      })
    }
  )
  
  if (memoryResponse.ok) {
    const result = await memoryResponse.json()
    console.log('✅ Memory ingestion response:', result)
  } else {
    console.error('❌ Memory ingestion failed:', await memoryResponse.text())
  }
  
  // 2. Test Code Ingestion (what Camille does)
  console.log('\n2. Testing Code Ingestion (edge function)...')
  const codeResponse = await fetch(
    `${supabaseUrl}/functions/v1/ingest-code`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: 'a02c3fed-3a24-442f-becc-97bac8b75e90',
        project_name: 'test-project',
        file_path: '/test/example.ts',
        content: `// Test code file
function testFunction() {
  console.log('Hello from test');
}`,
        language: 'typescript',
        metadata: {
          source: 'camille',
          timestamp: new Date().toISOString()
        }
      })
    }
  )
  
  if (codeResponse.ok) {
    const result = await codeResponse.json()
    console.log('✅ Code ingestion response:', result)
  } else {
    console.error('❌ Code ingestion failed:', await codeResponse.text())
  }
  
  // 3. Wait and check if pattern detection was triggered
  console.log('\n3. Waiting 5 seconds for queue processing...')
  await new Promise(resolve => setTimeout(resolve, 5000))
  
  // 4. Trigger workers to process queues
  console.log('\n4. Triggering queue workers...')
  const workers = ['memory-ingestion-worker', 'pattern-detection-worker']
  
  for (const worker of workers) {
    const workerResponse = await fetch(
      `${supabaseUrl}/functions/v1/${worker}`,
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
      const result = await workerResponse.json()
      console.log(`✅ ${worker}:`, result)
    } else {
      console.error(`❌ ${worker} failed:`, await workerResponse.text())
    }
  }
  
  console.log('\n✅ Camille integration test complete!')
  console.log('\nNotes:')
  console.log('- Memory and code are queued for async processing')
  console.log('- Pattern detection is automatically triggered after ingestion')
  console.log('- Workers process the queues in the background')
}

simulateCamilleIngestion().catch(console.error)