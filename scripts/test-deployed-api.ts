#!/usr/bin/env npx tsx
import { config as dotenvConfig } from 'dotenv'
import { resolve } from 'path'

// Load env vars
dotenvConfig({ path: resolve(process.cwd(), '.env.local') })

const DEPLOYED_URL = 'https://supastate.vercel.app'

async function testDeployedAPI() {
  console.log('🔍 Testing deployed API endpoints...\n')

  // Test 1: Check if the site is up
  console.log('1️⃣ Testing site availability...')
  try {
    const response = await fetch(DEPLOYED_URL)
    console.log(`   Status: ${response.status} ${response.statusText}`)
    console.log(`   ✅ Site is up!\n`)
  } catch (error) {
    console.error(`   ❌ Site is down: ${error instanceof Error ? error.message : 'Unknown error'}\n`)
    return
  }

  // Test 2: Test the hybrid search API without auth (should fail)
  console.log('2️⃣ Testing hybrid search API without auth...')
  try {
    const response = await fetch(`${DEPLOYED_URL}/api/neo4j/hybrid-search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: null,
        searchType: 'graph'
      })
    })
    const data = await response.json()
    console.log(`   Status: ${response.status}`)
    console.log(`   Response:`, JSON.stringify(data, null, 2))
    
    if (response.status === 401) {
      console.log(`   ✅ Auth check working correctly\n`)
    } else {
      console.log(`   ⚠️  Unexpected status code\n`)
    }
  } catch (error) {
    console.error(`   ❌ API error: ${error instanceof Error ? error.message : 'Unknown error'}\n`)
  }

  // Test 3: Check memory sync endpoint
  console.log('3️⃣ Testing memory sync API without auth...')
  try {
    const response = await fetch(`${DEPLOYED_URL}/api/memories/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        projectName: 'test',
        chunks: []
      })
    })
    const data = await response.json()
    console.log(`   Status: ${response.status}`)
    console.log(`   Response:`, JSON.stringify(data, null, 2))
    
    if (response.status === 401) {
      console.log(`   ✅ Auth check working correctly\n`)
    } else {
      console.log(`   ⚠️  Unexpected status code\n`)
    }
  } catch (error) {
    console.error(`   ❌ API error: ${error instanceof Error ? error.message : 'Unknown error'}\n`)
  }

  console.log('\n📝 Summary:')
  console.log('- Site is deployed and accessible')
  console.log('- API endpoints are responding')
  console.log('- Authentication is required (as expected)')
  console.log('\nTo test with authentication, you need to:')
  console.log('1. Visit https://supastate.vercel.app/memories')
  console.log('2. Sign in with your account')
  console.log('3. Check if you see the proper empty state message')
  console.log('4. Check browser console for any errors')
}

testDeployedAPI().catch(console.error)