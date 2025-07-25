#!/usr/bin/env npx tsx
import { config as dotenvConfig } from 'dotenv'
import { resolve } from 'path'

// Load env vars
dotenvConfig({ path: resolve(process.cwd(), '.env.local') })

const DEPLOYED_URL = 'https://supastate.vercel.app'

async function testMemorySync() {
  console.log('🔍 Testing memory sync endpoint...\n')

  // Create a test memory chunk
  const testData = {
    projectName: 'test-project',
    sessionId: 'test-session-123',
    chunks: [
      {
        chunkId: 'test-chunk-1',
        content: 'This is a test memory chunk for debugging Neo4j ingestion',
        embedding: new Array(3072).fill(0.1), // Mock embedding
        messageType: 'assistant',
        metadata: {
          hasCode: false,
          summary: 'Test memory chunk'
        }
      }
    ]
  }

  console.log('📤 Sending test memory chunk...')
  console.log(`Project: ${testData.projectName}`)
  console.log(`Chunks: ${testData.chunks.length}`)
  console.log(`Embedding dimensions: ${testData.chunks[0].embedding.length}`)

  try {
    // Test with API key authentication
    const response = await fetch(`${DEPLOYED_URL}/api/memories/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'test-api-key' // This will fail auth but show if endpoint is reachable
      },
      body: JSON.stringify(testData)
    })

    console.log(`\nResponse status: ${response.status}`)
    const responseData = await response.json()
    console.log('Response:', JSON.stringify(responseData, null, 2))

    if (response.status === 401) {
      console.log('\n✅ Endpoint is reachable and authentication is working')
      console.log('⚠️  To actually sync data, you need a valid API key or session')
    } else if (response.status === 200) {
      console.log('\n✅ Memory sync successful!')
    } else {
      console.log('\n❌ Unexpected response')
    }
  } catch (error) {
    console.error('\n❌ Failed to reach endpoint:', error)
  }
}

testMemorySync().catch(console.error)