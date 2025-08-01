#!/usr/bin/env npx tsx

import neo4j from 'neo4j-driver'
import { getOwnershipFilter, getOwnershipParams } from '../src/lib/neo4j/query-patterns'

// Use the same token from logs
const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhMDJjM2ZlZC0zYTI0LTQ0MmYtYmVjYy05N2JhYzhiNzVlOTAiLCJlbWFpbCI6InNyYW9AcG9zaXRyb25uZXR3b3Jrcy5jb20iLCJ3b3Jrc3BhY2VfaWQiOiJ0ZWFtOmEwNTFhZTYwLTM3NTAtNDY1Ni1hZTY2LTBjMjlhOGZmM2FiNyIsInNjb3BlIjoicmVhZCB3cml0ZSIsImNsaWVudF9pZCI6Im1jcF8xNzU0MDIyNDI0NTIyXzJpZG8yYyIsImlhdCI6MTc1NDAyNjk1NywiZXhwIjoxNzU0MTEzMzU3fQ.vpYh983U4TKZSR7_h1P38-BovgTUnsPcBnKITEIxdKM'

// Decode token to get user info
const tokenPayload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
const userId = tokenPayload.sub
const workspaceId = tokenPayload.workspace_id

console.log('Token info:', { userId, workspaceId })

// Test direct Neo4j queries to see what data we have
async function testDirectNeo4j() {
  console.log('\n=== Testing Direct Neo4j Queries ===\n')
  
  const driver = neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
  )
  
  const session = driver.session()
  
  try {
    // 1. Check what Memory nodes exist for this user/workspace
    console.log('1. Checking Memory nodes:')
    const ownershipFilter = getOwnershipFilter({ userId, workspaceId, nodeAlias: 'm' })
    const ownershipParams = getOwnershipParams({ userId, workspaceId })
    
    const memoryCountQuery = `
      MATCH (m:Memory)
      WHERE ${ownershipFilter}
      RETURN count(m) as count, 
             collect(DISTINCT m.user_id)[..3] as sampleUserIds,
             collect(DISTINCT m.workspace_id)[..3] as sampleWorkspaceIds
    `
    
    const memoryResult = await session.run(memoryCountQuery, ownershipParams)
    console.log('Memory nodes:', memoryResult.records[0]?.toObject())
    
    // 2. Check if we have embeddings
    console.log('\n2. Checking embeddings:')
    const embeddingQuery = `
      MATCH (m:Memory)
      WHERE ${ownershipFilter} AND m.embedding IS NOT NULL
      RETURN count(m) as withEmbeddings
    `
    
    const embeddingResult = await session.run(embeddingQuery, ownershipParams)
    console.log('Memories with embeddings:', embeddingResult.records[0]?.toObject())
    
    // 3. Check vector indexes
    console.log('\n3. Checking vector indexes:')
    const indexQuery = `
      SHOW INDEXES
      WHERE type = 'VECTOR'
    `
    
    const indexResult = await session.run(indexQuery)
    console.log('Vector indexes:')
    indexResult.records.forEach(record => {
      const index = record.toObject()
      console.log(`- ${index.name}: ${index.state} (${index.labelsOrTypes} - ${index.properties})`)
    })
    
    // 4. Try a sample search
    console.log('\n4. Testing sample memory search:')
    const searchQuery = `
      MATCH (m:Memory)
      WHERE ${ownershipFilter}
      RETURN m.id as id, m.content as content, m.summary as summary
      LIMIT 3
    `
    
    const searchResult = await session.run(searchQuery, ownershipParams)
    console.log('Sample memories:')
    searchResult.records.forEach(record => {
      const mem = record.toObject()
      console.log(`- ${mem.id}: ${(mem.summary || mem.content || '').substring(0, 100)}...`)
    })
    
    // 5. Check CodeEntity nodes
    console.log('\n5. Checking CodeEntity nodes:')
    const codeFilter = getOwnershipFilter({ userId, workspaceId, nodeAlias: 'c' })
    const codeCountQuery = `
      MATCH (c:CodeEntity)
      WHERE ${codeFilter}
      RETURN count(c) as count
    `
    
    const codeResult = await session.run(codeCountQuery, ownershipParams)
    console.log('CodeEntity nodes:', codeResult.records[0]?.toObject())
    
  } finally {
    await session.close()
    await driver.close()
  }
}

// Test OpenAI embedding generation
async function testEmbeddingGeneration() {
  console.log('\n=== Testing Embedding Generation ===\n')
  
  const openAIKey = process.env.OPENAI_API_KEY
  if (!openAIKey) {
    console.log('OPENAI_API_KEY not set')
    return
  }
  
  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'text-embedding-3-large',
        input: 'Camille test query',
        dimensions: 3072
      })
    })
    
    if (response.ok) {
      const data = await response.json()
      console.log('✓ Embedding generation works')
      console.log('  Dimensions:', data.data[0].embedding.length)
      console.log('  Usage:', data.usage)
    } else {
      console.log('✗ Embedding generation failed:', response.status)
      console.log('  Error:', await response.text())
    }
  } catch (e) {
    console.log('✗ Embedding generation error:', e)
  }
}

// Test the MCP endpoint directly
async function testMCPEndpoint() {
  console.log('\n=== Testing MCP Endpoint ===\n')
  
  const baseUrl = 'https://www.supastate.ai'
  
  // Get session
  console.log('1. Getting MCP session...')
  const sseResponse = await fetch(`${baseUrl}/sse`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'text/event-stream',
    },
  })
  
  if (!sseResponse.ok) {
    console.log('✗ Failed to get session:', sseResponse.status)
    return
  }
  
  const reader = sseResponse.body?.getReader()
  if (!reader) return
  
  const decoder = new TextDecoder()
  const { value } = await reader.read()
  const text = decoder.decode(value)
  console.log('✓ Got session response:', text)
  
  const sessionMatch = text.match(/sessionId=([a-f0-9-]+)/)
  if (!sessionMatch) {
    console.log('✗ No session ID found')
    return
  }
  
  const sessionId = sessionMatch[1]
  const messageEndpoint = `/message?sessionId=${sessionId}`
  console.log('✓ Session ID:', sessionId)
  
  reader.releaseLock()
  
  // Test searchMemories
  console.log('\n2. Testing searchMemories tool...')
  const searchRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'searchMemories',
      arguments: {
        query: 'Camille'
      }
    }
  }
  
  const searchResponse = await fetch(`${baseUrl}${messageEndpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(searchRequest)
  })
  
  console.log('✓ Search request sent:', searchResponse.status, searchResponse.statusText)
}

async function main() {
  // Load environment variables
  const envPath = '.env.local'
  const envContent = await import('fs').then(fs => fs.promises.readFile(envPath, 'utf-8'))
  envContent.split('\n').forEach(line => {
    const [key, ...values] = line.split('=')
    if (key && values.length) {
      process.env[key] = values.join('=')
    }
  })
  
  await testDirectNeo4j()
  await testEmbeddingGeneration()
  await testMCPEndpoint()
}

main().catch(console.error)