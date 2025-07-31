#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { resolve } from 'path'

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

async function testUnifiedSearchAPI() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('Missing environment variables')
    return
  }

  // Test queries
  const queries = [
    'middleware',
    'MCP',
    'debug',
    'pattern detection'
  ]

  // Use the actual user ID from the test
  const userId = 'a02c3fed-3a24-442f-becc-97bac8b75e90'

  for (const query of queries) {
    console.log(`\n--- Testing query: "${query}" ---`)
    
    try {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SERVICE_ROLE_KEY
        },
        body: JSON.stringify({
          email: `${userId}@example.com`,
          password: 'not-needed-with-service-role'
        })
      })

      // Use service role auth directly
      const apiResponse = await fetch('http://localhost:3000/api/search/unified', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
          'apikey': SERVICE_ROLE_KEY,
          'x-supabase-auth': JSON.stringify({ 
            sub: userId,
            role: 'authenticated',
            email: `${userId}@example.com` 
          })
        },
        body: JSON.stringify({
          query,
          includeMemories: true,
          includeCode: true,
          limit: 10
        })
      })

      console.log('Response status:', apiResponse.status)

      const data = await apiResponse.json()
      
      if (data.error) {
        console.error('Error:', data.error)
        if (data.details) console.error('Details:', data.details)
      } else {
        console.log(`Results: ${data.results?.length || 0} found`)
        console.log(`Intent: ${data.intent?.primaryIntent || 'unknown'}`)
        
        if (data.results?.length > 0) {
          data.results.slice(0, 3).forEach((result: any, i: number) => {
            console.log(`\n${i + 1}. ${result.title || 'Untitled'}`)
            console.log(`   Type: ${result.type}`)
            console.log(`   Score: ${result.score}`)
            if (result.snippet) {
              console.log(`   Snippet: ${result.snippet.substring(0, 100)}...`)
            }
          })
        } else {
          console.log('(No results found)')
        }
      }
    } catch (error) {
      console.error('Request failed:', error)
    }
  }
}

testUnifiedSearchAPI().catch(console.error)