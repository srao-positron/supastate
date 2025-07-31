#!/usr/bin/env npx tsx

/**
 * Test manual cosine similarity calculation
 */

import * as dotenv from 'dotenv'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
)

async function testManualCosineSimilarity() {
  const session = driver.session()
  
  try {
    console.log('=== Testing Manual Cosine Similarity ===\n')
    
    // 1. Test with simple vectors
    const simpleTest = await session.run(`
      WITH [1.0, 0.0, 0.0] as v1, [0.0, 1.0, 0.0] as v2
      WITH v1, v2,
           reduce(dot = 0.0, i IN range(0, size(v1)-1) | dot + v1[i] * v2[i]) as dotProduct,
           sqrt(reduce(sum = 0.0, val IN v1 | sum + val * val)) as norm1,
           sqrt(reduce(sum = 0.0, val IN v2 | sum + val * val)) as norm2
      RETURN CASE 
        WHEN norm1 = 0 OR norm2 = 0 THEN 0 
        ELSE dotProduct / (norm1 * norm2) 
      END as similarity
    `)
    console.log(`Simple test (orthogonal vectors): ${simpleTest.records[0].get('similarity')}`)
    
    // 2. Test with identical vectors
    const identicalTest = await session.run(`
      WITH [1.0, 2.0, 3.0] as v1, [1.0, 2.0, 3.0] as v2
      WITH v1, v2,
           reduce(dot = 0.0, i IN range(0, size(v1)-1) | dot + v1[i] * v2[i]) as dotProduct,
           sqrt(reduce(sum = 0.0, val IN v1 | sum + val * val)) as norm1,
           sqrt(reduce(sum = 0.0, val IN v2 | sum + val * val)) as norm2
      RETURN CASE 
        WHEN norm1 = 0 OR norm2 = 0 THEN 0 
        ELSE dotProduct / (norm1 * norm2) 
      END as similarity
    `)
    console.log(`Identical vectors test: ${identicalTest.records[0].get('similarity')}`)
    
    // 3. Test with real embeddings
    console.log('\nTesting with real EntitySummary embeddings...')
    const realTest = await session.run(`
      MATCH (e1:EntitySummary), (e2:EntitySummary)
      WHERE e1.id <> e2.id
        AND e1.embedding IS NOT NULL
        AND e2.embedding IS NOT NULL
      WITH e1, e2,
           e1.embedding as v1,
           e2.embedding as v2
      WITH e1, e2,
           reduce(dot = 0.0, i IN range(0, size(v1)-1) | dot + v1[i] * v2[i]) as dotProduct,
           sqrt(reduce(sum = 0.0, val IN v1 | sum + val * val)) as norm1,
           sqrt(reduce(sum = 0.0, val IN v2 | sum + val * val)) as norm2
      WITH e1.id as id1, e2.id as id2,
           CASE 
             WHEN norm1 = 0 OR norm2 = 0 THEN 0 
             ELSE dotProduct / (norm1 * norm2) 
           END as similarity
      WHERE similarity > 0.8
      RETURN id1, id2, similarity
      ORDER BY similarity DESC
      LIMIT 5
    `)
    
    console.log(`High similarity pairs found: ${realTest.records.length}`)
    realTest.records.forEach((record, idx) => {
      console.log(`${idx + 1}. Similarity: ${record.get('similarity')}`)
    })
    
    // 4. Test the exact query from pattern processor
    console.log('\nTesting pattern processor query...')
    const seedResult = await session.run(`
      MATCH (e:EntitySummary)
      WHERE e.pattern_signals CONTAINS '"is_debugging":true'
        AND e.embedding IS NOT NULL
      RETURN e.id as id
      LIMIT 1
    `)
    
    if (seedResult.records.length > 0) {
      const seedId = seedResult.records[0].get('id')
      console.log(`Using seed: ${seedId}`)
      
      const patternTest = await session.run(`
        MATCH (seed:EntitySummary {id: $seedId})
        MATCH (e:EntitySummary)
        WHERE e.id <> seed.id
          AND e.embedding IS NOT NULL
          AND seed.embedding IS NOT NULL
        WITH seed, e,
             seed.embedding as v1,
             e.embedding as v2,
             toString(date(e.created_at)) as day
        WITH e, day,
             reduce(dot = 0.0, i IN range(0, size(v1)-1) | dot + v1[i] * v2[i]) as dotProduct,
             sqrt(reduce(sum = 0.0, val IN v1 | sum + val * val)) as norm1,
             sqrt(reduce(sum = 0.0, val IN v2 | sum + val * val)) as norm2
        WITH e, day,
             CASE 
               WHEN norm1 = 0 OR norm2 = 0 THEN 0 
               ELSE dotProduct / (norm1 * norm2) 
             END as similarity
        WHERE similarity > 0.5
        RETURN count(*) as similarCount, max(similarity) as maxSim, min(similarity) as minSim
      `, { seedId })
      
      const count = patternTest.records[0].get('similarCount').low || 0
      const maxSim = patternTest.records[0].get('maxSim')
      const minSim = patternTest.records[0].get('minSim')
      
      console.log(`Similar entities found: ${count}`)
      console.log(`Similarity range: ${minSim} - ${maxSim}`)
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

testManualCosineSimilarity().catch(console.error)