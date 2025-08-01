#!/usr/bin/env npx tsx

import neo4j from 'neo4j-driver'
import { getOwnershipFilter, getOwnershipParams } from '../src/lib/neo4j/query-patterns'

// Test direct search with the new indexes
async function testSearchWithIndexes() {
  const userId = 'a02c3fed-3a24-442f-becc-97bac8b75e90'
  const workspaceId = 'team:a051ae60-3750-4656-ae66-0c29a8ff3ab7'
  
  const driver = neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
  )
  
  const session = driver.session()
  
  try {
    // Generate embedding for search
    const openAIKey = process.env.OPENAI_API_KEY!
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
    
    const data = await response.json()
    const embedding = data.data[0].embedding
    
    console.log('Generated embedding for "Camille" search')
    
    // Test memory search
    console.log('\n=== Testing Memory Search ===')
    const ownershipFilter = getOwnershipFilter({ userId, workspaceId, nodeAlias: 'm' })
    const ownershipParams = getOwnershipParams({ userId, workspaceId })
    
    const memoryQuery = `
      CALL db.index.vector.queryNodes('memory_embeddings', 5, $embedding)
      YIELD node as m, score
      WHERE ${ownershipFilter}
      RETURN 
        m.id as id,
        m.content as content,
        m.summary as summary,
        score
      ORDER BY score DESC
    `
    
    const memoryResult = await session.run(memoryQuery, {
      ...ownershipParams,
      embedding
    })
    
    console.log('\nMemory search results:')
    memoryResult.records.forEach((record, i) => {
      const id = record.get('id')
      const content = record.get('content') || record.get('summary') || ''
      const score = record.get('score')
      console.log(`${i + 1}. Score: ${score.toFixed(4)}`)
      console.log(`   ID: ${id}`)
      console.log(`   Content: ${content.substring(0, 100)}...`)
    })
    
    // Test unified search
    console.log('\n=== Testing Unified Search (Memory + Code) ===')
    const unifiedQuery = `
      CALL {
        CALL db.index.vector.queryNodes('memory_embeddings', 5, $embedding)
        YIELD node as n, score
        WHERE ${getOwnershipFilter({ userId, workspaceId, nodeAlias: 'n' })}
        RETURN n, score
        UNION
        CALL db.index.vector.queryNodes('code_embeddings', 5, $embedding)
        YIELD node as n, score
        WHERE ${getOwnershipFilter({ userId, workspaceId, nodeAlias: 'n' })}
        RETURN n, score
      }
      WITH n, score
      ORDER BY score DESC
      LIMIT 10
      RETURN 
        n.id as id,
        n.name as name,
        n.content as content,
        n.summary as summary,
        labels(n) as labels,
        score
    `
    
    const unifiedResult = await session.run(unifiedQuery, {
      ...ownershipParams,
      embedding
    })
    
    console.log('\nUnified search results:')
    unifiedResult.records.forEach((record, i) => {
      const id = record.get('id')
      const name = record.get('name')
      const content = record.get('content') || record.get('summary') || ''
      const labels = record.get('labels')
      const score = record.get('score')
      console.log(`${i + 1}. Score: ${score.toFixed(4)} [${labels.join(',')}]`)
      console.log(`   ID: ${id}`)
      if (name) console.log(`   Name: ${name}`)
      console.log(`   Content: ${content.substring(0, 100)}...`)
    })
    
  } finally {
    await session.close()
    await driver.close()
  }
}

// Load env
async function main() {
  const envPath = '.env.local'
  const envContent = await import('fs').then(fs => fs.promises.readFile(envPath, 'utf-8'))
  envContent.split('\n').forEach(line => {
    const [key, ...values] = line.split('=')
    if (key && values.length) {
      process.env[key] = values.join('=')
    }
  })
  
  await testSearchWithIndexes()
}

main().catch(console.error)