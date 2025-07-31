#!/usr/bin/env npx tsx

// Test unified search API with auth
async function testSearchWithAuth() {
  const baseUrl = 'http://localhost:3000'
  const authCookie = 'sb-service-auth-token.0=%7B%22access_token%22%3A%22eyJhbGciOiJIUzI1NiIsImtpZCI6Im9RUHJJZDJ3dUJnS0EvSHMiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL3pxbGZ4YWtia3dzc3hmeW5ybW5rLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiJhMDJjM2ZlZC0zYTI0LTQ0MmYtYmVjYy05N2JhYzhiNzVlOTAiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzUzODQwOTkwLCJpYXQiOjE3NTM4MzczOTAsImVtYWlsIjoic3Jhb0Bwb3NpdHJvbm5ldHdvcmtzLmNvbSIsInBob25lIjoiIiwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiZ2l0aHViIiwicHJvdmlkZXJzIjpbImdpdGh1YiJdfSwidXNlcl9tZXRhZGF0YSI6eyJhdmF0YXJfdXJsIjoiaHR0cHM6Ly9hdmF0YXJzLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzE0MzU1MDI2Nj92PTQiLCJlbWFpbCI6InNyYW9AcG9zaXRyb25uZXR3b3Jrcy5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwiZnVsbF9uYW1lIjoiU2lkIFJhbyIsImlzcyI6Imh0dHBzOi8vYXBpLmdpdGh1Yi5jb20iLCJuYW1lIjoiU2lkIFJhbyIsInBob25lX3ZlcmlmaWVkIjpmYWxzZSwicHJlZmVycmVkX3VzZXJuYW1lIjoic3Jhby1wb3NpdHJvbiIsInByb3ZpZGVyX2lkIjoiMTQzNTUwMjY2Iiwic3ViIjoiMTQzNTUwMjY2IiwidXNlcl9uYW1lIjoic3Jhby1wb3NpdHJvbiJ9LCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDEiLCJhbXIiOlt7Im1ldGhvZCI6Im9hdXRoIiwidGltZXN0YW1wIjoxNzUzNjQzOTA1fV0sInNlc3Npb25faWQiOiI0NjE3NGE1Yi02MzIyLTQyNTctOTM2OS1hMTU1Y2JiNjc0NjQiLCJpc19hbm9ueW1vdXMiOmZhbHNlfQ.IpOmc_Pqn6IKzDMksWiiolnCSw8ekfs2pmcOBp-KKaI%22%2C%22token_type%22%3A%22bearer%22%2C%22expires_in%22%3A3600%2C%22expires_at%22%3A1753840990%2C%22refresh_token%22%3A%22x2ajw7mkmy7r%22%2C%22user%22%3A%7B%22id%22%3A%22a02c3fed-3a24-442f-becc-97bac8b75e90%22%2C%22aud%22%3A%22authenticated%22%2C%22role%22%3A%22authenticated%22%2C%22email%22%3A%22srao%40positronnetworks.com%22%2C%22email_confirmed_at%22%3A%222025-07-23T00%3A02%3A56.179282Z%22%2C%22phone%22%3A%22%22%2C%22confirmed_at%22%3A%222025-07-23T00%3A02%3A56.179282Z%22%2C%22last_sign_in_at%22%3A%222025-07-28T18%3A11%3A32.264785Z%22%2C%22app_metadata%22%3A%7B%22provider%22%3A%22github%22%2C%22providers%22%3A%5B%22github%22%5D%7D%2C%22user_metadata%22%3A%7B%22avatar_url%22%3A%22https%3A%2F%2Favatars.githubusercontent.com%2Fu%2F143550266%3Fv%3D4%22%2C%22email%22%3A%22srao%40positronnetworks.com%22%2C%22email_verified%22%3Atrue%2C%22full_name%22%3A%22Sid%20Rao%22%2C%22iss%22%3A%22https%3A%2F%2Fapi.github.com%22%2C%22name%22%3A%22Sid%20Rao%22%2C%22phone_verified%22%3Afalse%2C%22preferred_username%22%3A%22srao-positron%22%2C%22provider_id%22%3A%22143550266%22%2C%22sub%22%3A%22143550266%22%2C%22user_name%22%3A%22srao-positron%22%7D%2C%22identities%22%3A%5B%7B%22identity_id%22%3A%226f3e5bbb-733c-4181-b1d4-421c082e9253%22%2C%22id%22%3A%22143550266%22%2C%22user_id%22%3A%22a02c3fed-3a24-442f-becc-97bac8b75e90%22%2C%22identity_data%22%3A%7B%22avatar_url%22%3A%22https%3A%2F%2Favatars.githubusercontent.com%2Fu%2F143550266%3Fv%3D4%22%2C%22email%22%3A%22srao%40positronnetworks.com%22%2C%22email_verified%22%3Atrue%2C%22full_name%22%3A%22Sid%20Rao%22%2C%22iss%22%3A%22https%3A%2F%2Fapi.github.com%22%2C%22name%22%3A%22Sid%20Rao%22%2C%22phone_verified%22%3Afalse%2C%22preferred_username%22%3A%22srao-positron%22%2C%22provider_id%22%3A%22143550266%22%2C%22sub%22%3A%22143550266%22%2C%22user_name%22%3A%22srao-positron%22%7D%2C%22provider%22%3A%22github%22%2C%22last_sign_in_at%22%3A%222025-07-23T00%3A02%3A56.173749Z%22%2C%22created_at%22%3A%222025-07-23T00%3A02%3A56.173796Z%22%2C%22updated_at; sb-service-auth-token.1=%22%3A%222025-07-28T18%3A11%3A31.119414Z%22%2C%22email%22%3A%22srao%40positronnetworks.com%22%7D%5D%2C%22created_at%22%3A%222025-07-23T00%3A02%3A56.168427Z%22%2C%22updated_at%22%3A%222025-07-30T01%3A03%3A10.795289Z%22%2C%22is_anonymous%22%3Afalse%7D%7D'
  
  console.log('Testing unified search API with auth...\n')
  
  const testQueries = ['middleware', 'MCP', 'debug', 'pattern detection']
  
  for (const query of testQueries) {
    console.log(`\n--- Testing query: "${query}" ---`)
    
    try {
      const response = await fetch(`${baseUrl}/api/search/unified`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': authCookie
        },
        body: JSON.stringify({
          query,
          filters: {
            includeMemories: true,
            includeCode: true
          },
          pagination: {
            limit: 10
          }
        })
      })
      
      console.log(`Response status: ${response.status}`)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('Error response:', errorText)
        continue
      }
      
      const data = await response.json()
      
      console.log('\nInterpretation:')
      console.log(`  Intent: ${data.interpretation?.intent}`)
      console.log(`  Strategies: ${data.interpretation?.searchStrategies?.join(', ')}`)
      
      console.log(`\nResults: ${data.results?.length || 0} found`)
      
      if (data.results && data.results.length > 0) {
        data.results.slice(0, 3).forEach((result: any, i: number) => {
          console.log(`\n  ${i + 1}. [${result.type}] ${result.content.title}`)
          console.log(`     Score: ${result.metadata.score.toFixed(3)}`)
          console.log(`     Match: ${result.metadata.matchType}`)
          console.log(`     Snippet: ${result.content.snippet.substring(0, 100)}...`)
          console.log(`     Relations: ${Object.keys(result.relationships).map(k => `${k}(${result.relationships[k].length})`).join(', ')}`)
        })
      } else {
        console.log('  (No results found)')
      }
      
    } catch (error) {
      console.error('Request failed:', error)
    }
  }
}

testSearchWithAuth().catch(console.error)