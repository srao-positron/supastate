#!/usr/bin/env npx tsx

/**
 * Check vector indexes and test vector similarity functions
 */

import * as dotenv from 'dotenv'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
)

async function checkVectorIndexesAndTest() {
  const session = driver.session()
  
  try {
    console.log('=== Vector Indexes in Neo4j ===\n')
    
    // List all vector indexes
    const indexResult = await session.run(`
      SHOW INDEXES
      WHERE type = 'VECTOR'
    `)
    
    console.log('Vector indexes found:')
    indexResult.records.forEach(record => {
      console.log(`- ${record.get('name')} on ${record.get('labelsOrTypes')}(${record.get('properties')})`)
    })
    
    console.log('\n=== Testing vector.similarity.cosine() function ===\n')
    
    // Get two EntitySummary nodes with embeddings
    const testNodes = await session.run(`
      MATCH (e1:EntitySummary), (e2:EntitySummary)
      WHERE e1.embedding IS NOT NULL 
        AND e2.embedding IS NOT NULL
        AND e1.id <> e2.id
      RETURN e1.id as id1, e2.id as id2, 
             e1.embedding as emb1, e2.embedding as emb2
      LIMIT 1
    `)
    
    if (testNodes.records.length > 0) {
      const record = testNodes.records[0]
      const id1 = record.get('id1')
      const id2 = record.get('id2')
      
      // Test vector.similarity.cosine
      console.log('Testing vector.similarity.cosine() between two entities...')
      const similarityResult = await session.run(`
        MATCH (e1:EntitySummary {id: $id1})
        MATCH (e2:EntitySummary {id: $id2})
        RETURN vector.similarity.cosine(e1.embedding, e2.embedding) as similarity
      `, { id1, id2 })
      
      const similarity = similarityResult.records[0].get('similarity')
      console.log(`Cosine similarity: ${similarity}`)
      
      console.log('\n=== Using vector similarity in pattern detection ===\n')
      
      // Get a debugging seed
      const seedResult = await session.run(`
        MATCH (e:EntitySummary)
        WHERE e.pattern_signals CONTAINS '"is_debugging":true'
          AND e.embedding IS NOT NULL
        RETURN e.id as id, e.embedding as embedding
        LIMIT 1
      `)
      
      if (seedResult.records.length > 0) {
        const seedId = seedResult.records[0].get('id')
        const seedEmbedding = seedResult.records[0].get('embedding')
        
        console.log(`Using seed: ${seedId}`)
        
        // Method 1: Using vector.similarity.cosine in WHERE clause
        console.log('\nMethod 1: Direct similarity calculation')
        const method1 = await session.run(`
          MATCH (seed:EntitySummary {id: $seedId})
          MATCH (e:EntitySummary)
          WHERE e.id <> seed.id
            AND e.embedding IS NOT NULL
            AND vector.similarity.cosine(seed.embedding, e.embedding) > 0.7
          RETURN e.id as id, 
                 e.project_name as project,
                 vector.similarity.cosine(seed.embedding, e.embedding) as similarity
          ORDER BY similarity DESC
          LIMIT 10
        `, { seedId })
        
        console.log(`Found ${method1.records.length} similar entities`)
        method1.records.forEach((record, idx) => {
          console.log(`${idx + 1}. ${record.get('project')} - similarity: ${record.get('similarity').toFixed(3)}`)
        })
        
        // Method 2: Using db.index.vector.queryNodes (if available)
        console.log('\n\nMethod 2: Using vector index (db.index.vector.queryNodes)')
        try {
          const method2 = await session.run(`
            CALL db.index.vector.queryNodes(
              'entity_summary_embedding',
              10,
              $embedding
            ) YIELD node, score
            WHERE node.id <> $seedId
            RETURN node.id as id, node.project_name as project, score
          `, { seedId, embedding: seedEmbedding })
          
          console.log(`Found ${method2.records.length} similar entities`)
          method2.records.forEach((record, idx) => {
            console.log(`${idx + 1}. ${record.get('project')} - score: ${record.get('score').toFixed(3)}`)
          })
        } catch (e) {
          console.log('db.index.vector.queryNodes not available or different syntax needed')
        }
      }
    }
    
    console.log('\n=== Recommended approach for edge functions ===')
    console.log('Use vector.similarity.cosine() function directly in Cypher queries')
    console.log('This is supported in Neo4j 5.11+ and works with Aura')
    
  } finally {
    await session.close()
    await driver.close()
  }
}

checkVectorIndexesAndTest().catch(console.error)