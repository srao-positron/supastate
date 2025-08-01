#!/usr/bin/env npx tsx

import { createClient } from '@supabase/supabase-js'

async function testMCPOwnership() {
  // Initialize Supabase client
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  // Get a test user with known data
  const testUserId = 'a02c3fed-3a24-442f-becc-97bac8b75e90'
  const testWorkspaceId = 'team:a051ae60-3750-4656-ae66-0c29a8ff3ab7'
  
  // First, get an MCP token through the exchange
  console.log('Testing MCP token exchange...')
  
  // Create a temporary auth code
  const authCode = 'test_code_' + Date.now()
  
  // Store auth code data (simulating what the auth flow would do)
  const authCodeData = {
    userId: testUserId,
    email: 'test@example.com',
    expiresAt: Date.now() + 600000 // 10 minutes
  }
  
  console.log('\n=== Testing MCP Token Exchange ===')
  console.log('User ID:', testUserId)
  console.log('Workspace ID:', testWorkspaceId)
  
  // Test the MCP endpoint with a proper token
  const mcpToken = await generateMCPToken(testUserId, testWorkspaceId)
  
  console.log('\n=== Testing MCP Search Tools ===')
  
  // Test search tool
  await testSearchTool(mcpToken)
  
  // Test searchCode tool
  await testSearchCodeTool(mcpToken)
  
  // Test searchMemories tool
  await testSearchMemoriesTool(mcpToken)
}

async function generateMCPToken(userId: string, workspaceId: string): Promise<string> {
  // In a real scenario, this would go through the OAuth flow
  // For testing, we'll create a token directly
  const { SignJWT } = await import('jose')
  
  const secret = new TextEncoder().encode(
    process.env.MCP_TOKEN_SECRET || 'mcp-token-secret-change-in-production'
  )
  
  const token = await new SignJWT({
    sub: userId,
    workspace_id: workspaceId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
  }).setProtectedHeader({ alg: 'HS256' }).sign(secret)
  
  return token
}

async function testSearchTool(token: string) {
  console.log('\n1. Testing search tool...')
  
  const response = await fetch('http://localhost:3000/sse', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'search',
        arguments: {
          query: 'Camille',
          limit: 5
        }
      },
      id: 1
    })
  })
  
  if (!response.ok) {
    console.error('Error:', response.status, await response.text())
    return
  }
  
  const result = await response.json()
  console.log('Search results:', JSON.stringify(result, null, 2))
}

async function testSearchCodeTool(token: string) {
  console.log('\n2. Testing searchCode tool...')
  
  const response = await fetch('http://localhost:3000/sse', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'searchCode',
        arguments: {
          query: 'memory ingestion',
          language: 'typescript'
        }
      },
      id: 2
    })
  })
  
  if (!response.ok) {
    console.error('Error:', response.status, await response.text())
    return
  }
  
  const result = await response.json()
  console.log('Code search results:', JSON.stringify(result, null, 2))
}

async function testSearchMemoriesTool(token: string) {
  console.log('\n3. Testing searchMemories tool...')
  
  const response = await fetch('http://localhost:3000/sse', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'searchMemories',
        arguments: {
          query: 'pattern detection',
          projects: ['camille']
        }
      },
      id: 3
    })
  })
  
  if (!response.ok) {
    console.error('Error:', response.status, await response.text())
    return
  }
  
  const result = await response.json()
  console.log('Memory search results:', JSON.stringify(result, null, 2))
}

// Load env and run tests
async function main() {
  const envPath = '.env.local'
  const envContent = await import('fs').then(fs => fs.promises.readFile(envPath, 'utf-8'))
  envContent.split('\n').forEach(line => {
    const [key, ...values] = line.split('=')
    if (key && values.length) {
      process.env[key] = values.join('=')
    }
  })
  
  await testMCPOwnership()
}

main().catch(console.error)