#!/usr/bin/env npx tsx
import { config as dotenvConfig } from 'dotenv'
import { resolve } from 'path'

// Load env vars
dotenvConfig({ path: resolve(process.cwd(), '.env.local') })

async function testAPISearch() {
  console.log('🔍 Testing Memory Search API...\n')

  const baseUrl = 'http://localhost:3000'
  
  try {
    // First, we need to authenticate
    console.log('Note: You need to be logged in to the app for this to work.')
    console.log('Testing without query (initial load)...\n')

    // Test 1: No query (initial load)
    const response1 = await fetch(`${baseUrl}/api/neo4j/hybrid-search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        searchType: 'hybrid',
        limit: 5
      }),
      credentials: 'include' // Include cookies
    })

    console.log('Response status:', response1.status)
    const data1 = await response1.json()
    console.log('Response:', JSON.stringify(data1, null, 2))

    // Test 2: With a simple query
    console.log('\n\nTesting with query "user"...')
    const response2 = await fetch(`${baseUrl}/api/neo4j/hybrid-search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: 'user',
        searchType: 'hybrid',
        limit: 5
      }),
      credentials: 'include'
    })

    console.log('Response status:', response2.status)
    const data2 = await response2.json()
    console.log('Response:', JSON.stringify(data2, null, 2))

  } catch (error) {
    console.error('Error:', error)
  }
}

testAPISearch().catch(console.error)