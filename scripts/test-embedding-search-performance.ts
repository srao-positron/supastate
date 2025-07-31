#!/usr/bin/env npx tsx

/**
 * Test embedding search performance and correctness
 */

import * as dotenv from 'dotenv'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
)

async function testEmbeddingSearch() {
  const session = driver.session()
  
  try {
    console.log('=== Testing Embedding Search Performance ===\n')
    
    // 1. First check if we have vector indexes
    const indexCheck = await session.run(`
      SHOW INDEXES
      WHERE type = 'VECTOR'
    `)
    
    console.log(`Vector indexes found: ${indexCheck.records.length}`)
    indexCheck.records.forEach(record => {
      console.log(`  - ${record.get('name')} on ${record.get('labelsOrTypes')}(${record.get('properties')})`)
    })
    
    // 2. Test self-similarity (should be 1.0)
    console.log('\nTesting self-similarity...')
    const selfTest = await session.run(`
      MATCH (e:EntitySummary)
      WHERE e.embedding IS NOT NULL
      WITH e, e.embedding as v
      WITH e,
           reduce(dot = 0.0, i IN range(0, size(v)-1) | dot + v[i] * v[i]) as dotProduct,
           sqrt(reduce(sum = 0.0, val IN v | sum + val * val)) as norm
      RETURN e.id as id, dotProduct / (norm * norm) as similarity
      LIMIT 5
    `)
    
    selfTest.records.forEach(record => {
      console.log(`  Self-similarity: ${record.get('similarity')} (should be ~1.0)`)
    })
    
    // 3. Test if the manual calculation is correct by checking known similar content
    console.log('\nFinding semantically similar debugging entities...')
    
    // Get a debugging seed
    const seedResult = await session.run(`
      MATCH (e:EntitySummary)
      WHERE e.pattern_signals CONTAINS '"is_debugging":true'
        AND e.embedding IS NOT NULL
      RETURN e.id as id, e.entity_id as entityId
      ORDER BY e.created_at DESC
      LIMIT 1
    `)
    
    if (seedResult.records.length > 0) {
      const seedId = seedResult.records[0].get('id')
      console.log(`\nUsing seed: ${seedId}`)
      
      // Find similar with our manual calculation
      console.log('Calculating similarities (this may take a moment)...')
      const startTime = Date.now()
      
      const similarResult = await session.run(`
        MATCH (seed:EntitySummary {id: $seedId})
        WITH seed, seed.embedding as seedEmb
        MATCH (e:EntitySummary)
        WHERE e.id <> seed.id
          AND e.embedding IS NOT NULL
          AND e.pattern_signals CONTAINS '"is_debugging":true'
        WITH seed, e, seedEmb, e.embedding as targetEmb
        LIMIT 100  // Limit to avoid timeout
        WITH seed, e,
             reduce(dot = 0.0, i IN range(0, size(seedEmb)-1) | dot + seedEmb[i] * targetEmb[i]) as dotProduct,
             sqrt(reduce(sum = 0.0, val IN seedEmb | sum + val * val)) as norm1,
             sqrt(reduce(sum = 0.0, val IN targetEmb | sum + val * val)) as norm2
        WITH e, 
             CASE 
               WHEN norm1 = 0 OR norm2 = 0 THEN 0 
               ELSE dotProduct / (norm1 * norm2) 
             END as similarity
        WHERE similarity > 0.7
        RETURN e.id as id, similarity, e.entity_id as entityId
        ORDER BY similarity DESC
        LIMIT 10
      `, { seedId })
      
      const elapsed = Date.now() - startTime
      console.log(`Query completed in ${elapsed}ms`)
      console.log(`\nTop similar debugging entities:`)
      
      similarResult.records.forEach((record, idx) => {
        console.log(`${idx + 1}. Similarity: ${record.get('similarity').toFixed(4)} - ${record.get('entityId')}`)
      })
    }
    
    // 4. Check if we should be using vector indexes instead
    console.log('\n\nRECOMMENDATION:')
    console.log('Neo4j 5.27 supports vector indexes for efficient similarity search.')
    console.log('We should create a vector index on EntitySummary.embedding for better performance.')
    console.log('\nTo create a vector index:')
    console.log(`CREATE VECTOR INDEX entity_embeddings IF NOT EXISTS
FOR (e:EntitySummary) 
ON (e.embedding)
OPTIONS {indexConfig: {
  \`vector.dimensions\`: 3072,
  \`vector.similarity_function\`: 'cosine'
}}`)
    
  } finally {
    await session.close()
    await driver.close()
  }
}

testEmbeddingSearch().catch(console.error)