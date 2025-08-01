#!/usr/bin/env npx tsx

// Token from the logs
const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhMDJjM2ZlZC0zYTI0LTQ0MmYtYmVjYy05N2JhYzhiNzVlOTAiLCJlbWFpbCI6InNyYW9AcG9zaXRyb25uZXR3b3Jrcy5jb20iLCJ3b3Jrc3BhY2VfaWQiOiJ0ZWFtOmEwNTFhZTYwLTM3NTAtNDY1Ni1hZTY2LTBjMjlhOGZmM2FiNyIsInNjb3BlIjoicmVhZCB3cml0ZSIsImNsaWVudF9pZCI6Im1jcF8xNzU0MDIyNDI0NTIyXzJpZG8yYyIsImlhdCI6MTc1NDAyNjk1NywiZXhwIjoxNzU0MTEzMzU3fQ.vpYh983U4TKZSR7_h1P38-BovgTUnsPcBnKITEIxdKM'

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.supastate.ai'

async function testMcpEndpoint() {
  console.log('Testing MCP endpoint...')
  
  // Test 1: Initialize connection
  console.log('\n1. Testing initialize:')
  const initResponse = await fetch(`${baseUrl}/sse`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
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
    })
  })
  
  console.log('Response status:', initResponse.status)
  const initData = await initResponse.text()
  console.log('Response:', initData)
  
  // Test 2: List tools
  console.log('\n2. Testing tools/list:')
  const toolsResponse = await fetch(`${baseUrl}/sse`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    })
  })
  
  console.log('Response status:', toolsResponse.status)
  const toolsData = await toolsResponse.text()
  console.log('Response:', toolsData)
  
  // Test 3: Call searchMemories tool
  console.log('\n3. Testing searchMemories tool:')
  const searchResponse = await fetch(`${baseUrl}/sse`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'searchMemories',
        arguments: {
          query: 'Camille'
        }
      }
    })
  })
  
  console.log('Response status:', searchResponse.status)
  const searchData = await searchResponse.text()
  console.log('Response:', searchData)
  
  // Test 4: Test SSE connection
  console.log('\n4. Testing SSE connection:')
  const eventSource = new EventSource(`${baseUrl}/sse`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    }
  })
  
  eventSource.onopen = () => {
    console.log('SSE connection opened')
  }
  
  eventSource.onmessage = (event) => {
    console.log('SSE message:', event.data)
  }
  
  eventSource.onerror = (error) => {
    console.error('SSE error:', error)
    eventSource.close()
  }
  
  // Give SSE a few seconds to connect
  setTimeout(() => {
    eventSource.close()
    console.log('SSE connection closed')
  }, 5000)
}

testMcpEndpoint().catch(console.error)