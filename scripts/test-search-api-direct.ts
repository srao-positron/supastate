#!/usr/bin/env npx tsx

// Simple direct test of the unified search API
async function testSearchAPI() {
  const baseUrl = 'http://localhost:3000'
  
  console.log('Testing unified search API directly...\n')
  
  const testQuery = 'debug'
  
  try {
    console.log(`Searching for: "${testQuery}"`)
    
    const response = await fetch(`${baseUrl}/api/search/unified`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Add a dummy auth header to bypass auth checks in dev
        'Cookie': 'sb-access-token=dummy-token'
      },
      body: JSON.stringify({
        query: testQuery,
        filters: {
          includeMemories: true,
          includeCode: true
        },
        pagination: {
          limit: 5
        }
      })
    })
    
    console.log(`Response status: ${response.status}`)
    console.log(`Response headers:`, Object.fromEntries(response.headers.entries()))
    
    const responseText = await response.text()
    console.log('\nResponse body:')
    console.log(responseText)
    
    if (response.ok) {
      try {
        const data = JSON.parse(responseText)
        console.log('\nParsed response:')
        console.log(`- Results count: ${data.results?.length || 0}`)
        console.log(`- Has interpretation: ${!!data.interpretation}`)
        console.log(`- Has facets: ${!!data.facets}`)
      } catch (e) {
        console.error('Failed to parse JSON:', e)
      }
    }
    
  } catch (error) {
    console.error('Request failed:', error)
  }
}

testSearchAPI().catch(console.error)