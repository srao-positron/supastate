#!/usr/bin/env npx tsx

const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhMDJjM2ZlZC0zYTI0LTQ0MmYtYmVjYy05N2JhYzhiNzVlOTAiLCJlbWFpbCI6InNyYW9AcG9zaXRyb25uZXR3b3Jrcy5jb20iLCJ3b3Jrc3BhY2VfaWQiOiJ0ZWFtOmEwNTFhZTYwLTM3NTAtNDY1Ni1hZTY2LTBjMjlhOGZmM2FiNyIsInNjb3BlIjoicmVhZCB3cml0ZSIsImNsaWVudF9pZCI6Im1jcF8xNzU0MDIyNDI0NTIyXzJpZG8yYyIsImlhdCI6MTc1NDAyNjk1NywiZXhwIjoxNzU0MTEzMzU3fQ.vpYh983U4TKZSR7_h1P38-BovgTUnsPcBnKITEIxdKM'

const baseUrl = 'https://www.supastate.ai'

interface MCPMessage {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: any
}

async function sendMCPMessage(message: MCPMessage): Promise<any> {
  console.log(`\nSending ${message.method}:`, JSON.stringify(message, null, 2))
  
  const response = await fetch(`${baseUrl}/sse`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'text/event-stream',
      'Accept': 'text/event-stream',
    },
    body: `data: ${JSON.stringify(message)}\n\n`,
  })
  
  console.log('Response status:', response.status)
  console.log('Response headers:', Object.fromEntries(response.headers.entries()))
  
  const text = await response.text()
  console.log('Response body:', text)
  
  // Try to parse SSE response
  const lines = text.split('\n')
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        const data = JSON.parse(line.slice(6))
        console.log('Parsed data:', JSON.stringify(data, null, 2))
      } catch (e) {
        console.log('Raw data:', line.slice(6))
      }
    }
  }
  
  return text
}

async function testMCP() {
  // Test capabilities first
  console.log('Testing MCP Server Capabilities...')
  
  // First, let's try a GET request to see what we get
  console.log('\n1. Testing GET request:')
  const getResponse = await fetch(`${baseUrl}/sse`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  })
  console.log('GET Response status:', getResponse.status)
  console.log('GET Response headers:', Object.fromEntries(getResponse.headers.entries()))
  
  // Try capabilities endpoint
  console.log('\n2. Testing capabilities:')
  const capResponse = await fetch(`${baseUrl}/sse/capabilities`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  })
  console.log('Capabilities Response status:', capResponse.status)
  if (capResponse.ok) {
    const capData = await capResponse.json()
    console.log('Capabilities:', JSON.stringify(capData, null, 2))
  }
  
  // Test the MCP messages
  const messages: MCPMessage[] = [
    {
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
    },
    {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    },
    {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'searchMemories',
        arguments: {
          query: 'Camille'
        }
      }
    }
  ]
  
  // Send messages
  for (const message of messages) {
    await sendMCPMessage(message)
    await new Promise(resolve => setTimeout(resolve, 1000)) // Wait a bit between messages
  }
}

testMCP().catch(console.error)