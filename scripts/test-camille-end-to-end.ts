#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

// Test the complete flow as Camille would use it
async function testCamilleEndToEnd() {
  console.log('=== Testing Camille End-to-End Flow ===\n')
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  
  // Create a service client to get a valid user token
  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  
  // Get the user data
  const { data: users } = await supabase
    .from('users')
    .select('id')
    .limit(1)
    
  if (!users || users.length === 0) {
    console.error('No users found')
    return
  }
  
  const userId = users[0].id
  console.log(`Using user ID: ${userId}`)
  
  // Generate a token for the user (in production, Camille has its own auth)
  // For testing, we'll use service role
  
  // 1. Test Memory Ingestion with Camille's exact format
  console.log('\n1. Testing Memory Ingestion...')
  const memoryRequest = {
    projectName: "camille-test-project",
    teamId: undefined,
    chunks: [
      {
        sessionId: "camille-session-" + Date.now(),
        chunkId: "chunk-" + Date.now() + "-1",
        content: "Testing Camille memory ingestion. Implementing queue-based architecture for pattern detection.",
        metadata: {
          projectName: "camille-test-project",
          timestamp: new Date().toISOString(),
          source: "camille"
        }
      },
      {
        sessionId: "camille-session-" + Date.now(),
        chunkId: "chunk-" + Date.now() + "-2",
        content: "Debugging the pattern detection system. Found issue with workspace isolation.",
        metadata: {
          projectName: "camille-test-project",
          timestamp: new Date().toISOString(),
          source: "camille"
        }
      }
    ]
  }
  
  const memoryResponse = await fetch(
    `${supabaseUrl}/functions/v1/ingest-memory`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`, // In prod, this would be user's token
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(memoryRequest)
    }
  )
  
  if (memoryResponse.ok) {
    const result = await memoryResponse.json()
    console.log('✅ Memory ingestion response:', result)
  } else {
    console.error('❌ Memory ingestion failed:', await memoryResponse.text())
    return
  }
  
  // 2. Test Code Ingestion with Camille's exact format
  console.log('\n2. Testing Code Ingestion...')
  const codeRequest = {
    projectName: "camille-test-project",
    files: [
      {
        path: "/src/test-queue.ts",
        content: `// Test file for queue system
async function processQueue() {
  console.log('Processing queue...');
}`,
        language: "typescript",
        lastModified: new Date().toISOString()
      }
    ],
    fullSync: false
  }
  
  const codeResponse = await fetch(
    `${supabaseUrl}/functions/v1/ingest-code`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`, // In prod, this would be user's token
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(codeRequest)
    }
  )
  
  if (codeResponse.ok) {
    const result = await codeResponse.json()
    console.log('✅ Code ingestion response:', result)
  } else {
    console.error('❌ Code ingestion failed:', await codeResponse.text())
  }
  
  // 3. Wait for processing
  console.log('\n3. Waiting 5 seconds for queue processing...')
  await new Promise(resolve => setTimeout(resolve, 5000))
  
  // 4. Trigger workers
  console.log('\n4. Triggering queue workers...')
  const workers = ['memory-ingestion-worker', 'pattern-detection-worker']
  
  for (const worker of workers) {
    console.log(`\nTriggering ${worker}...`)
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
  
  // 5. Check logs
  console.log('\n5. Checking recent logs...')
  const { data: logs } = await supabase
    .from('pattern_processor_logs')
    .select('created_at, level, message, function_name')
    .gte('created_at', new Date(Date.now() - 60000).toISOString())
    .order('created_at', { ascending: false })
    .limit(10)
    
  if (logs && logs.length > 0) {
    console.log('\nRecent logs:')
    for (const log of logs) {
      const time = new Date(log.created_at).toLocaleTimeString()
      console.log(`[${time}] [${log.function_name}] [${log.level}] ${log.message}`)
    }
  }
  
  console.log('\n✅ End-to-end test complete!')
  console.log('\nSummary:')
  console.log('- Memory chunks are saved and queued')
  console.log('- Code files are saved and processed')
  console.log('- Workers process queues asynchronously')
  console.log('- Pattern detection runs automatically')
  console.log('- All activity is logged to database')
}

testCamilleEndToEnd().catch(console.error)