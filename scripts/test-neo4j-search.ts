#!/usr/bin/env npx tsx
import { config as dotenvConfig } from 'dotenv'
import { resolve } from 'path'
import { executeQuery } from '../src/lib/neo4j/client'

// Load env vars
dotenvConfig({ path: resolve(process.cwd(), '.env.local') })

async function testNeo4jSearch() {
  console.log('🔍 Testing Neo4j Search...\n')

  try {
    // 1. Test direct query for all memories
    console.log('1. Direct query for all memories:')
    const allMemories = await executeQuery(`
      MATCH (m:Memory)
      RETURN m.id as id, m.content as content, m.project_name as project, m.user_id as user_id, m.team_id as team_id
      LIMIT 5
    `)
    
    console.log(`Found ${allMemories.records.length} memories`)
    allMemories.records.forEach(record => {
      console.log(`  - ${record.id?.substring(0, 8)}... | Project: ${record.project} | User: ${record.user_id} | Team: ${record.team_id}`)
      console.log(`    Content: ${record.content?.substring(0, 50)}...`)
    })

    // 2. Test vector index query
    console.log('\n2. Testing vector index:')
    const vectorTest = await executeQuery(`
      SHOW INDEXES YIELD name, type, entityType, labelsOrTypes, properties
      WHERE type = 'VECTOR'
    `)
    
    if (vectorTest.records.length > 0) {
      console.log('Vector indexes found:')
      vectorTest.records.forEach(record => {
        console.log(`  - ${record.name} on ${record.labelsOrTypes} (${record.properties})`)
      })
    } else {
      console.log('No vector indexes found!')
    }

    // 3. Test if embeddings exist
    console.log('\n3. Checking if embeddings exist:')
    const embeddingCheck = await executeQuery(`
      MATCH (m:Memory)
      WHERE m.embedding IS NOT NULL
      RETURN count(m) as count
    `)
    console.log(`Memories with embeddings: ${embeddingCheck.records[0]?.count || 0}`)

    // 4. Test simple hybrid search query without embedding
    console.log('\n4. Testing simple search without embedding:')
    const simpleSearch = await executeQuery(`
      MATCH (memory:Memory)
      RETURN memory.id as id, memory.content as content, memory.project_name as project
      ORDER BY memory.created_at DESC
      LIMIT 5
    `)
    
    console.log(`Found ${simpleSearch.records.length} results`)
    simpleSearch.records.forEach(record => {
      console.log(`  - ${record.project}: ${record.content?.substring(0, 60)}...`)
    })

  } catch (error) {
    console.error('Error:', error)
  }

  process.exit(0)
}

testNeo4jSearch().catch(console.error)