#!/usr/bin/env npx tsx

async function testContentAPI() {
  const testCases = [
    { type: 'memory', id: '2024-08-23-00-00-09-000-e802e4ca-d973-4e3f-aa6e-e9fda039ad48' },
    { type: 'code', id: 'eeb3c0f2-4c7c-4370-acfc-5bee8a0bbc56' }
  ]

  for (const test of testCases) {
    console.log(`\nTesting ${test.type} content API:`)
    const url = `http://localhost:3000/api/content/${test.type}/${test.id}`
    console.log(`URL: ${url}`)
    
    try {
      const response = await fetch(url, {
        headers: {
          'Cookie': 'sb-service-auth-token.0=%7B%22access_token%22%3A%22eyJhbGciOiJIUzI1NiIsImtpZCI6Im9RUHJJZDJ3dUJnS0EvSHMiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL3pxbGZ4YWtia3dzc3hmeW5ybW5rLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiJhMDJjM2ZlZC0zYTI0LTQ0MmYtYmVjYy05N2JhYzhiNzVlOTAiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzUzODQ4NzcyLCJpYXQiOjE3NTM4NDUxNzIsImVtYWlsIjoic3Jhb0Bwb3NpdHJvbm5ldHdvcmtzLmNvbSIsInBob25lIjoiIiwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiZ2l0aHViIiwicHJvdmlkZXJzIjpbImdpdGh1YiJdfSwidXNlcl9tZXRhZGF0YSI6eyJhdmF0YXJfdXJsIjoiaHR0cHM6Ly9hdmF0YXJzLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzE0MzU1MDI2Nj92PTQiLCJlbWFpbCI6InNyYW9AcG9zaXRyb25uZXR3b3Jrcy5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwiZnVsbF9uYW1lIjoiU2lkIFJhbyIsImlzcyI6Imh0dHBzOi8vYXBpLmdpdGh1Yi5jb20iLCJuYW1lIjoiU2lkIFJhbyIsInBob25lX3ZlcmlmaWVkIjpmYWxzZSwicHJlZmVycmVkX3VzZXJuYW1lIjoic3Jhby1wb3NpdHJvbiIsInByb3ZpZGVyX2lkIjoiMTQzNTUwMjY2Iiwic3ViIjoiMTQzNTUwMjY2IiwidXNlcl9uYW1lIjoic3Jhby1wb3NpdHJvbiJ9LCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDEiLCJhbXIiOlt7Im1ldGhvZCI6Im9hdXRoIiwidGltZXN0YW1wIjoxNzUzNjQzOTA1fV0sInNlc3Npb25faWQiOiI0NjE3NGE1Yi02MzIyLTQyNTctOTM2OS1hMTU1Y2JiNjc0NjQiLCJpc19hbm9ueW1vdXMiOmZhbHNlfQ.XRJxiOODXyZM-BcP3ihgstxYOOfpWy6Sf1rPV-5-HOQ%22%2C%22token_type%22%3A%22bearer%22%2C%22expires_in%22%3A3600%2C%22expires_at%22%3A1753848772%2C%22refresh_token%22%3A%22hnywgnum7acf%22%2C%22user%22%3A%7B%22id%22%3A%22a02c3fed-3a24-442f-becc-97bac8b75e90%22%2C%22aud%22%3A%22authenticated%22%2C%22role%22%3A%22authenticated%22%2C%22email%22%3A%22srao%40positronnetworks.com%22%2C%22email_confirmed_at%22%3A%222025-07-23T00%3A02%3A56.179282Z%22%2C%22phone%22%3A%22%22%2C%22confirmed_at%22%3A%222025-07-23T00%3A02%3A56.179282Z%22%2C%22last_sign_in_at%22%3A%222025-07-28T18%3A11%3A32.264785Z%22%2C%22app_metadata%22%3A%7B%22provider%22%3A%22github%22%2C%22providers%22%3A%5B%22github%22%5D%7D%2C%22user_metadata%22%3A%7B%22avatar_url%22%3A%22https%3A%2F%2Favatars.githubusercontent.com%2Fu%2F143550266%3Fv%3D4%22%2C%22email%22%3A%22srao%40positronnetworks.com%22%2C%22email_verified%22%3Atrue%2C%22full_name%22%3A%22Sid%20Rao%22%2C%22iss%22%3A%22https%3A%2F%2Fapi.github.com%22%2C%22name%22%3A%22Sid%20Rao%22%2C%22phone_verified%22%3Afalse%2C%22preferred_username%22%3A%22srao-positron%22%2C%22provider_id%22%3A%22143550266%22%2C%22sub%22%3A%22143550266%22%2C%22user_name%22%3A%22srao-positron%22%7D%2C%22identities%22%3A%5B%7B%22identity_id%22%3A%226f3e5bbb-733c-4181-b1d4-421c082e9253%22%2C%22id%22%3A%22143550266%22%2C%22user_id%22%3A%22a02c3fed-3a24-442f-becc-97bac8b75e90%22%2C%22identity_data%22%3A%7B%22avatar_url%22%3A%22https%3A%2F%2Favatars.githubusercontent.com%2Fu%2F143550266%3Fv%3D4%22%2C%22email%22%3A%22srao%40positronnetworks.com%22%2C%22email_verified%22%3Atrue%2C%22full_name%22%3A%22Sid%20Rao%22%2C%22iss%22%3A%22https%3A%2F%2Fapi.github.com%22%2C%22name%22%3A%22Sid%20Rao%22%2C%22phone_verified%22%3Afalse%2C%22preferred_username%22%3A%22srao-positron%22%2C%22provider_id%22%3A%22143550266%22%2C%22sub%22%3A%22143550266%22%2C%22user_name%22%3A%22srao-positron%22%7D%2C%22provider%22%3A%22github%22%2C%22last_sign_in_at%22%3A%222025-07-23T00%3A02%3A56.173749Z%22%2C%22created_at%22%3A%222025-07-23T00%3A02%3A56.173796Z%22%2C%22updated_at%22%3A%222025-07-28T18%3A11%3A31.119414Z%22%2C%22email%22%3A%22srao%40positronnetworks.com%22%7D%5D%2C%22created_at%22%3A%222025-07-23T00%3A02%3A56.168427Z%22%2C%22updated_at%22%3A%222025-07-30T08%3A24%3A50.902045Z%22%2C%22is_anonymous%22%3Afalse%7D%7D'
        }
      })
      
      console.log(`Status: ${response.status}`)
      
      if (response.ok) {
        const data = await response.json()
        console.log('Success! Content length:', data.content?.length || 0)
        console.log('Relationships:', {
          total: data.relationships?.length || 0
        })
      } else {
        const error = await response.text()
        console.log('Error:', error)
      }
    } catch (error) {
      console.error('Request failed:', error)
    }
  }
}

testContentAPI().catch(console.error)