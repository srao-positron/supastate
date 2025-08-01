#!/usr/bin/env npx tsx

import { EventSource } from 'eventsource'

const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhMDJjM2ZlZC0zYTI0LTQ0MmYtYmVjYy05N2JhYzhiNzVlOTAiLCJlbWFpbCI6InNyYW9AcG9zaXRyb25uZXR3b3Jrcy5jb20iLCJ3b3Jrc3BhY2VfaWQiOiJ0ZWFtOmEwNTFhZTYwLTM3NTAtNDY1Ni1hZTY2LTBjMjlhOGZmM2FiNyIsInNjb3BlIjoicmVhZCB3cml0ZSIsImNsaWVudF9pZCI6Im1jcF8xNzU0MDIyNDI0NTIyXzJpZG8yYyIsImlhdCI6MTc1NDAyNjk1NywiZXhwIjoxNzU0MTEzMzU3fQ.vpYh983U4TKZSR7_h1P38-BovgTUnsPcBnKITEIxdKM'

const baseUrl = 'https://www.supastate.ai'

async function testMCPSession() {
  console.log('Testing MCP session-based communication...\n')
  
  // First, get the session ID from SSE
  console.log('1. Getting session ID from SSE endpoint...')
  const sseResponse = await fetch(`${baseUrl}/sse`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'text/event-stream',
    },
  })
  
  if (!sseResponse.ok) {
    console.error('Failed to connect to SSE:', sseResponse.status)
    return
  }
  
  const reader = sseResponse.body?.getReader()
  if (!reader) {
    console.error('No response body')
    return
  }
  
  let sessionId = ''
  let messageEndpoint = ''
  
  // Read the SSE stream to get the session info
  const decoder = new TextDecoder()
  let buffer = ''
  
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim()
      if (line.startsWith('data: ')) {
        const data = line.slice(6)
        console.log('SSE data:', data)
        
        // Extract session ID from the message endpoint
        const match = data.match(/sessionId=([a-f0-9-]+)/)
        if (match) {
          sessionId = match[1]
          messageEndpoint = data
          console.log('Found session ID:', sessionId)
        }
      }
    }
    
    buffer = lines[lines.length - 1]
    
    if (sessionId) break
  }
  
  reader.releaseLock()
  
  if (!sessionId) {
    console.error('No session ID found')
    return
  }
  
  // Now send messages to the message endpoint
  console.log(`\n2. Sending initialize to ${messageEndpoint}...`)
  
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
  
  const messageUrl = `${baseUrl}${messageEndpoint}`
  console.log('Posting to:', messageUrl)
  
  const messageResponse = await fetch(messageUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(initRequest)
  })
  
  console.log('Response:', messageResponse.status, messageResponse.statusText)
  const responseText = await messageResponse.text()
  console.log('Response body:', responseText)
  
  // Set up SSE listener for responses
  console.log('\n3. Setting up SSE listener for responses...')
  const eventSource = new EventSource(`${baseUrl}/sse`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    }
  })
  
  eventSource.onmessage = (event) => {
    console.log('SSE message:', event.data)
  }
  
  eventSource.onerror = (error) => {
    console.error('SSE error:', error)
  }
  
  // Send more requests
  console.log('\n4. Sending tools/list request...')
  const toolsRequest = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {}
  }
  
  const toolsResponse = await fetch(messageUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(toolsRequest)
  })
  
  console.log('Tools response:', toolsResponse.status)
  
  // Wait a bit for any SSE responses
  await new Promise(resolve => setTimeout(resolve, 3000))
  
  eventSource.close()
  console.log('\nTest complete')
}

testMCPSession().catch(console.error)