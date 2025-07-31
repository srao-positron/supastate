#!/usr/bin/env npx tsx

/**
 * Test GDS similarity functions directly
 */

import * as dotenv from 'dotenv'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

async function testGDSSimilarity() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
  )
  
  try {
    const session = driver.session()
    
    console.log('\n=== Testing GDS Similarity ===')
    
    // Get a debugging entity with embedding
    const seedResult = await session.run(`
      MATCH (e:EntitySummary)
      WHERE e.pattern_signals CONTAINS '"is_debugging":true'
        AND e.embedding IS NOT NULL
      RETURN e.id as id, e.embedding as embedding
      LIMIT 1
    `)
    
    if (seedResult.records.length === 0) {
      console.log('No debugging entities with embeddings found')
      return
    }
    
    const seedId = seedResult.records[0].get('id')
    console.log(`\nUsing seed entity: ${seedId}`)
    
    // Test direct GDS similarity
    console.log('\nTesting GDS cosine similarity...')
    
    const similarityResult = await session.run(`
      MATCH (seed:EntitySummary {id: $seedId})
      MATCH (other:EntitySummary)
      WHERE other.id <> seed.id
        AND other.embedding IS NOT NULL
        AND seed.embedding IS NOT NULL
      WITH seed, other, gds.similarity.cosine(seed.embedding, other.embedding) as similarity
      WHERE similarity > 0.8
      RETURN other.id as id, 
             other.pattern_signals as signals,
             similarity
      ORDER BY similarity DESC
      LIMIT 10
    `, { seedId })
    
    console.log(`\nFound ${similarityResult.records.length} similar entities:`)
    
    similarityResult.records.forEach((record, idx) => {
      const otherId = record.get('id')
      const signals = record.get('signals')
      const similarity = record.get('similarity')
      
      console.log(`\n${idx + 1}. ID: ${otherId}`)
      console.log(`   Similarity: ${similarity}`)
      console.log(`   Signals: ${signals}`)
    })
    
    // Test if we can find semantically similar but different patterns
    console.log('\n\nLooking for cross-pattern similarities...')
    
    const crossPatternResult = await session.run(`
      MATCH (debug:EntitySummary)
      WHERE debug.pattern_signals CONTAINS '"is_debugging":true'
        AND debug.embedding IS NOT NULL
      WITH debug LIMIT 1
      MATCH (other:EntitySummary)
      WHERE other.id <> debug.id
        AND other.embedding IS NOT NULL
        AND NOT (other.pattern_signals CONTAINS '"is_debugging":true')
      WITH debug, other, gds.similarity.cosine(debug.embedding, other.embedding) as similarity
      WHERE similarity > 0.85
      RETURN other.id as id,
             other.pattern_signals as signals,
             similarity,
             CASE 
               WHEN other.pattern_signals CONTAINS '"is_learning":true' THEN 'learning'
               WHEN other.pattern_signals CONTAINS '"is_refactoring":true' THEN 'refactoring'
               ELSE 'other'
             END as pattern_type
      ORDER BY similarity DESC
      LIMIT 5
    `)
    
    if (crossPatternResult.records.length > 0) {
      console.log('\nFound cross-pattern semantic similarities:')
      crossPatternResult.records.forEach((record, idx) => {
        console.log(`\n${idx + 1}. Pattern type: ${record.get('pattern_type')}`)
        console.log(`   Similarity: ${record.get('similarity')}`)
        console.log(`   Signals: ${record.get('signals')}`)
      })
    } else {
      console.log('\nNo cross-pattern similarities found')
    }
    
    await session.close()
  } finally {
    await driver.close()
  }
}

testGDSSimilarity().catch(console.error)