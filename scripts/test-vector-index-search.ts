#!/usr/bin/env npx tsx

/**
 * Test using Neo4j vector index for similarity search
 */

import * as dotenv from 'dotenv'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
)

async function testVectorIndexSearch() {
  const session = driver.session()
  
  try {
    console.log('=== Testing Vector Index Search ===\n')
    
    // Get a debugging seed
    const seedResult = await session.run(`
      MATCH (e:EntitySummary)
      WHERE e.pattern_signals CONTAINS '"is_debugging":true'
        AND e.embedding IS NOT NULL
      RETURN e.id as id, e.embedding as embedding
      LIMIT 1
    `)
    
    if (seedResult.records.length === 0) {
      console.log('No debugging seed found')
      return
    }
    
    const seedId = seedResult.records[0].get('id')
    const seedEmbedding = seedResult.records[0].get('embedding')
    
    console.log(`Using seed: ${seedId}`)
    console.log(`Embedding size: ${seedEmbedding.length}`)
    
    // Try using vector index search (Neo4j 5.11+)
    console.log('\nTrying vector index search...')
    try {
      const vectorSearchResult = await session.run(`
        CALL db.index.vector.queryNodes(
          'entity_summary_embedding',
          10,
          $embedding
        ) YIELD node, score
        WHERE node.id <> $seedId
        RETURN node.id as id, score, node.project_name as project
      `, {
        seedId,
        embedding: seedEmbedding
      })
      
      console.log(`Found ${vectorSearchResult.records.length} similar entities using vector index`)
      vectorSearchResult.records.forEach((record, idx) => {
        console.log(`${idx + 1}. Score: ${record.get('score').toFixed(4)} - Project: ${record.get('project')}`)
      })
    } catch (e) {
      console.log('Vector index search failed:', e.message)
      console.log('\nThis might mean:')
      console.log('1. Vector index search syntax is different in your Neo4j version')
      console.log('2. The index might need to be recreated with vector support')
    }
    
    // Check index configuration
    console.log('\n\nChecking vector index configuration...')
    const indexInfo = await session.run(`
      SHOW INDEXES
      WHERE name = 'entity_summary_embedding'
    `)
    
    if (indexInfo.records.length > 0) {
      const index = indexInfo.records[0]
      console.log('Index details:')
      console.log(`  Name: ${index.get('name')}`)
      console.log(`  Type: ${index.get('type')}`)
      console.log(`  State: ${index.get('state')}`)
      console.log(`  Properties: ${index.get('properties')}`)
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

testVectorIndexSearch().catch(console.error)