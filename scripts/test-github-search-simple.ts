#!/usr/bin/env npx tsx
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

async function testSearch() {
  console.log('Testing GitHub search with service role...\n')
  
  // Create a simple test request with service role auth
  const response = await fetch(`${appUrl}/api/github/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'x-user-id': 'a02c3fed-3a24-442f-becc-97bac8b75e90' // Correct user ID with GitHub access
    },
    body: JSON.stringify({
      query: 'search',
      limit: 5
    })
  })
  
  console.log('Response status:', response.status)
  
  if (!response.ok) {
    const error = await response.text()
    console.error('Error:', error)
    return
  }
  
  const results = await response.json()
  console.log('\nFull response:', JSON.stringify(results, null, 2))
  console.log('\nSearch results:')
  console.log(`Found ${results.total} results from ${results.repositories_searched} repositories`)
  console.log(`Query: "${results.query}"`)
  
  if (results.results && results.results.length > 0) {
    console.log('\nTop results:')
    results.results.forEach((result: any, i: number) => {
      console.log(`\n${i + 1}. [${result.type}] ${result.repository} (score: ${result.score.toFixed(3)})`)
      if (result.type === 'issue' || result.type === 'pull_request') {
        console.log(`   #${result.data.number}: ${result.data.title}`)
      } else if (result.type === 'commit') {
        console.log(`   ${result.data.sha.substring(0, 7)}: ${result.data.message.split('\n')[0]}`)
      } else if (result.type === 'code') {
        console.log(`   ${result.data.path} (${result.data.language})`)
      }
    })
  } else {
    console.log('No results found')
  }
}

testSearch()