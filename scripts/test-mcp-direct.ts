#!/usr/bin/env npx tsx

const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhMDJjM2ZlZC0zYTI0LTQ0MmYtYmVjYy05N2JhYzhiNzVlOTAiLCJlbWFpbCI6InNyYW9AcG9zaXRyb25uZXR3b3Jrcy5jb20iLCJ3b3Jrc3BhY2VfaWQiOiJ0ZWFtOmEwNTFhZTYwLTM3NTAtNDY1Ni1hZTY2LTBjMjlhOGZmM2FiNyIsInNjb3BlIjoicmVhZCB3cml0ZSIsImNsaWVudF9pZCI6Im1jcF8xNzU0MDIyNDI0NTIyXzJpZG8yYyIsImlhdCI6MTc1NDAyNjk1NywiZXhwIjoxNzU0MTEzMzU3fQ.vpYh983U4TKZSR7_h1P38-BovgTUnsPcBnKITEIxdKM'

const baseUrl = 'https://www.supastate.ai'

// Test direct Neo4j connection and search
async function testDirectSearch() {
  console.log('Testing direct search without MCP adapter...')
  
  // Test search API directly
  const searchUrl = `${baseUrl}/api/search/unified`
  
  const searchBody = {
    query: 'Camille',
    types: ['memory'],
    limit: 5
  }
  
  console.log('\nTesting unified search API:')
  console.log('Request:', JSON.stringify(searchBody, null, 2))
  
  const response = await fetch(searchUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(searchBody)
  })
  
  console.log('Response status:', response.status)
  
  if (response.ok) {
    const data = await response.json()
    console.log('Response data:', JSON.stringify(data, null, 2))
  } else {
    const error = await response.text()
    console.log('Error response:', error)
  }
}

// Test OpenAI embedding generation
async function testEmbeddingGeneration() {
  console.log('\n\nTesting embedding generation...')
  
  const openAIKey = process.env.OPENAI_API_KEY
  if (!openAIKey) {
    console.log('OPENAI_API_KEY not set in environment')
    return
  }
  
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openAIKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'text-embedding-3-large',
      input: 'Camille',
      dimensions: 3072
    })
  })
  
  console.log('OpenAI Response status:', response.status)
  
  if (response.ok) {
    const data = await response.json()
    console.log('Embedding dimensions:', data.data[0].embedding.length)
    console.log('First 10 values:', data.data[0].embedding.slice(0, 10))
  } else {
    const error = await response.text()
    console.log('OpenAI Error:', error)
  }
}

async function main() {
  await testDirectSearch()
  await testEmbeddingGeneration()
}

main().catch(console.error)