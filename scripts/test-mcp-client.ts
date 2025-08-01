#!/usr/bin/env npx tsx

import { EventSource } from 'eventsource'

const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhMDJjM2ZlZC0zYTI0LTQ0MmYtYmVjYy05N2JhYzhiNzVlOTAiLCJlbWFpbCI6InNyYW9AcG9zaXRyb25uZXR3b3Jrcy5jb20iLCJ3b3Jrc3BhY2VfaWQiOiJ0ZWFtOmEwNTFhZTYwLTM3NTAtNDY1Ni1hZTY2LTBjMjlhOGZmM2FiNyIsInNjb3BlIjoicmVhZCB3cml0ZSIsImNsaWVudF9pZCI6Im1jcF8xNzU0MDIyNDI0NTIyXzJpZG8yYyIsImlhdCI6MTc1NDAyNjk1NywiZXhwIjoxNzU0MTEzMzU3fQ.vpYh983U4TKZSR7_h1P38-BovgTUnsPcBnKITEIxdKM'

const baseUrl = 'https://www.supastate.ai'

// MCP over SSE communication
class MCPClient {
  private eventSource: EventSource | null = null
  private messageId = 0
  private pendingRequests = new Map<number, { resolve: Function, reject: Function }>()
  
  async connect(url: string, token: string) {
    return new Promise((resolve, reject) => {
      console.log('Connecting to MCP server...')
      
      this.eventSource = new EventSource(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      })
      
      this.eventSource.onopen = () => {
        console.log('SSE connection opened')
        resolve(true)
      }
      
      this.eventSource.onmessage = (event) => {
        console.log('Received message:', event.data)
        try {
          const message = JSON.parse(event.data)
          
          // Handle response to our requests
          if (message.id && this.pendingRequests.has(message.id)) {
            const { resolve } = this.pendingRequests.get(message.id)!
            this.pendingRequests.delete(message.id)
            resolve(message)
          }
        } catch (e) {
          console.error('Failed to parse message:', e)
        }
      }
      
      this.eventSource.onerror = (error) => {
        console.error('SSE error:', error)
        reject(error)
      }
    })
  }
  
  async sendRequest(method: string, params?: any): Promise<any> {
    if (!this.eventSource) {
      throw new Error('Not connected')
    }
    
    const id = ++this.messageId
    const message = {
      jsonrpc: '2.0',
      id,
      method,
      params
    }
    
    console.log(`\nSending ${method}:`, JSON.stringify(message, null, 2))
    
    // For SSE, we need to send messages via a different channel
    // The MCP adapter might expect messages via query params or a separate endpoint
    // Let's try sending via a POST to the same endpoint
    const response = await fetch(`${baseUrl}/sse?message=${encodeURIComponent(JSON.stringify(message))}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message)
    })
    
    console.log('POST Response:', response.status, await response.text())
    
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject })
      
      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new Error('Request timeout'))
        }
      }, 10000)
    })
  }
  
  close() {
    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }
  }
}

async function testMCPClient() {
  const client = new MCPClient()
  
  try {
    // Connect to the SSE endpoint
    await client.connect(`${baseUrl}/sse`, token)
    
    // Wait a bit for connection to stabilize
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Try to initialize
    try {
      const initResponse = await client.sendRequest('initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: {
          name: 'test-client',
          version: '1.0.0'
        }
      })
      console.log('Initialize response:', initResponse)
    } catch (e) {
      console.error('Initialize failed:', e)
    }
    
    // Try to list tools
    try {
      const toolsResponse = await client.sendRequest('tools/list', {})
      console.log('Tools response:', toolsResponse)
    } catch (e) {
      console.error('Tools list failed:', e)
    }
    
    // Wait a bit before closing
    await new Promise(resolve => setTimeout(resolve, 2000))
    
  } finally {
    client.close()
  }
}

testMCPClient().catch(console.error)