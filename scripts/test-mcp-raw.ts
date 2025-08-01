#!/usr/bin/env npx tsx

// Test MCP protocol directly without SSE
const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhMDJjM2ZlZC0zYTI0LTQ0MmYtYmVjYy05N2JhYzhiNzVlOTAiLCJlbWFpbCI6InNyYW9AcG9zaXRyb25uZXR3b3Jrcy5jb20iLCJ3b3Jrc3BhY2VfaWQiOiJ0ZWFtOmEwNTFhZTYwLTM3NTAtNDY1Ni1hZTY2LTBjMjlhOGZmM2FiNyIsInNjb3BlIjoicmVhZCB3cml0ZSIsImNsaWVudF9pZCI6Im1jcF8xNzU0MDIyNDI0NTIyXzJpZG8yYyIsImlhdCI6MTc1NDAyNjk1NywiZXhwIjoxNzU0MTEzMzU3fQ.vpYh983U4TKZSR7_h1P38-BovgTUnsPcBnKITEIxdKM'

const baseUrl = 'https://www.supastate.ai'

// Test the transport endpoint directly
async function testTransportEndpoint() {
  console.log('Testing MCP transport endpoint directly...\n')
  
  // The [transport] route should handle different MCP protocols
  // Let's test with /mcp which might be the expected path
  const endpoints = [
    '/mcp',
    '/http',
    '/sse',
  ]
  
  for (const endpoint of endpoints) {
    console.log(`\nTesting ${endpoint}:`)
    
    // Test GET request first
    const getResponse = await fetch(`${baseUrl}${endpoint}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json, text/event-stream',
      },
    })
    
    console.log(`GET ${endpoint}: ${getResponse.status} ${getResponse.statusText}`)
    console.log('Content-Type:', getResponse.headers.get('content-type'))
    
    if (getResponse.status === 200) {
      // For SSE endpoints, just read a bit
      if (getResponse.headers.get('content-type')?.includes('event-stream')) {
        const reader = getResponse.body?.getReader()
        if (reader) {
          const { value } = await reader.read()
          if (value) {
            const text = new TextDecoder().decode(value)
            console.log('First chunk:', text.substring(0, 200))
          }
          reader.releaseLock()
        }
      } else {
        const text = await getResponse.text()
        console.log('Response:', text.substring(0, 200))
      }
    }
  }
  
  // Now test the MCP protocol over HTTP
  console.log('\n\nTesting MCP over HTTP transport:')
  
  const httpEndpoint = `${baseUrl}/http`
  
  // Initialize request
  const initRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: {
        name: 'test-client',
        version: '1.0.0'
      }
    }
  }
  
  console.log('\nSending initialize to /http:')
  const httpResponse = await fetch(httpEndpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(initRequest)
  })
  
  console.log('Response:', httpResponse.status, httpResponse.statusText)
  console.log('Headers:', Object.fromEntries(httpResponse.headers.entries()))
  
  if (httpResponse.ok) {
    const data = await httpResponse.json()
    console.log('Response data:', JSON.stringify(data, null, 2))
  } else {
    const text = await httpResponse.text()
    console.log('Error response:', text)
  }
}

testTransportEndpoint().catch(console.error)