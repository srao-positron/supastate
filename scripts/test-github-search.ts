#!/usr/bin/env npx tsx
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function testGitHubSearch() {
  console.log('Testing GitHub search API...\n')
  
  // Get a user with GitHub token
  const { data: users } = await supabase
    .from('users')
    .select('id, email')
    .not('github_access_token_encrypted', 'is', null)
    .limit(1)
  
  if (!users || users.length === 0) {
    console.error('No users with GitHub tokens found')
    return
  }
  
  const user = users[0]
  console.log(`Using user: ${user.email}\n`)
  
  // Test different search queries
  const queries = [
    { query: 'search', description: 'Search for "search" keyword' },
    { query: 'memory', description: 'Search for "memory" keyword' },
    { query: 'semantic similarity', description: 'Search for "semantic similarity"' },
    { query: 'bug fix', description: 'Search for bug fixes' }
  ]
  
  for (const test of queries) {
    console.log(`\n--- ${test.description} ---`)
    
    try {
      const response = await fetch(`${appUrl}/api/github/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `sb-zqlfxakbkwssxfynrmnk-auth-token=${Buffer.from(JSON.stringify({
            access_token: supabaseServiceKey,
            token_type: 'bearer',
            user: { id: user.id }
          })).toString('base64')}`
        },
        body: JSON.stringify({
          query: test.query,
          limit: 5
        })
      })
      
      if (!response.ok) {
        const error = await response.text()
        console.error('Search failed:', error)
        continue
      }
      
      const results = await response.json()
      console.log(`Found ${results.total} results from ${results.repositories_searched} repositories`)
      
      if (results.results && results.results.length > 0) {
        results.results.slice(0, 3).forEach((result: any, i: number) => {
          console.log(`\n${i + 1}. [${result.type}] ${result.repository} (score: ${result.score.toFixed(3)})`)
          if (result.type === 'issue' || result.type === 'pull_request') {
            console.log(`   #${result.data.number}: ${result.data.title}`)
            console.log(`   State: ${result.data.state}, Author: ${result.data.author}`)
          } else if (result.type === 'commit') {
            console.log(`   ${result.data.sha.substring(0, 7)}: ${result.data.message.split('\n')[0]}`)
            console.log(`   Author: ${result.data.author}`)
          } else if (result.type === 'code') {
            console.log(`   ${result.data.path}`)
            console.log(`   Language: ${result.data.language}, Size: ${result.data.size} bytes`)
            if (result.data.content_preview) {
              console.log(`   Preview: ${result.data.content_preview.substring(0, 100)}...`)
            }
          }
        })
      }
      
    } catch (error) {
      console.error('Error:', error)
    }
  }
  
  // Test with filters
  console.log('\n\n--- Testing with filters ---')
  
  const filteredSearch = {
    query: 'function',
    filters: {
      entity_types: ['code'],
      languages: ['ts', 'tsx']
    },
    limit: 5
  }
  
  try {
    const response = await fetch(`${appUrl}/api/github/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `sb-zqlfxakbkwssxfynrmnk-auth-token=${Buffer.from(JSON.stringify({
          access_token: supabaseServiceKey,
          token_type: 'bearer',
          user: { id: user.id }
        })).toString('base64')}`
      },
      body: JSON.stringify(filteredSearch)
    })
    
    if (response.ok) {
      const results = await response.json()
      console.log(`\nFiltered search for TypeScript functions:`)
      console.log(`Found ${results.total} results`)
      console.log('Filters applied:', results.filters_applied)
      
      results.results?.slice(0, 3).forEach((result: any, i: number) => {
        console.log(`\n${i + 1}. ${result.data.path} (${result.data.language})`)
        console.log(`   Score: ${result.score.toFixed(3)}`)
      })
    }
  } catch (error) {
    console.error('Filtered search error:', error)
  }
  
  console.log('\n✅ GitHub search test completed!')
}

testGitHubSearch()