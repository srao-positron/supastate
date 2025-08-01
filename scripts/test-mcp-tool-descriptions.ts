#!/usr/bin/env npx tsx

/**
 * Test script to verify MCP tool descriptions are properly returned
 */

async function testMCPToolDescriptions() {
  const baseUrl = 'http://localhost:3000'
  
  console.log('Testing MCP tool descriptions...\n')
  
  // First, let's check the capabilities endpoint
  console.log('1. Testing capabilities endpoint...')
  try {
    const response = await fetch(`${baseUrl}/sse/capabilities`, {
      headers: {
        'Accept': 'application/json',
      }
    })
    
    if (response.ok) {
      const capabilities = await response.json()
      console.log('Capabilities response:')
      console.log(JSON.stringify(capabilities, null, 2))
    } else {
      console.log('Capabilities endpoint returned:', response.status)
    }
  } catch (error) {
    console.log('Capabilities endpoint not available (expected for MCP adapter)')
  }
  
  // Test the actual MCP protocol list tools
  console.log('\n2. Testing MCP list tools...')
  
  // Generate a test token
  const { SignJWT } = await import('jose')
  const secret = new TextEncoder().encode(
    process.env.MCP_TOKEN_SECRET || 'mcp-token-secret-change-in-production'
  )
  
  const token = await new SignJWT({
    sub: 'test-user',
    workspace_id: 'test-workspace',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  }).setProtectedHeader({ alg: 'HS256' }).sign(secret)
  
  const listToolsRequest = {
    jsonrpc: '2.0',
    method: 'tools/list',
    id: 1
  }
  
  const response = await fetch(`${baseUrl}/sse`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(listToolsRequest)
  })
  
  if (!response.ok) {
    console.error('Error:', response.status, await response.text())
    return
  }
  
  const result = await response.json()
  console.log('\nMCP tools/list response:')
  
  // Check if we have the rich descriptions
  if (result.result && result.result.tools) {
    result.result.tools.forEach((tool: any) => {
      console.log(`\n=== Tool: ${tool.name} ===`)
      console.log('Description length:', tool.description?.length || 0)
      console.log('Has rich documentation:', tool.description?.length > 200 ? 'YES' : 'NO')
      console.log('First 200 chars:', tool.description?.substring(0, 200) + '...')
    })
  } else {
    console.log(JSON.stringify(result, null, 2))
  }
}

// Load env and run
async function main() {
  const envPath = '.env.local'
  const envContent = await import('fs').then(fs => fs.promises.readFile(envPath, 'utf-8'))
  envContent.split('\n').forEach(line => {
    const [key, ...values] = line.split('=')
    if (key && values.length) {
      process.env[key] = values.join('=')
    }
  })
  
  await testMCPToolDescriptions()
}

main().catch(console.error)