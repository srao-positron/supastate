#!/usr/bin/env npx tsx

/**
 * Test semantic similarity between debugging entities
 */

import * as dotenv from 'dotenv'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

async function testSemanticSimilarity() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
  )
  
  try {
    const session = driver.session()
    
    console.log('\n=== Testing Semantic Similarity ===')
    
    // Get some debugging entities as seeds
    const seedResult = await session.run(`
      MATCH (e:EntitySummary)
      WHERE e.pattern_signals CONTAINS '"is_debugging":true'
        AND e.embedding IS NOT NULL
      RETURN e.id as id, e.embedding as embedding, e.keyword_frequencies as keywords
      ORDER BY e.created_at DESC
      LIMIT 5
    `)
    
    console.log(`\nFound ${seedResult.records.length} debugging seeds`)
    
    if (seedResult.records.length === 0) {
      console.log('No debugging entities with embeddings found')
      return
    }
    
    // For each seed, find similar entities
    for (let i = 0; i < Math.min(2, seedResult.records.length); i++) {
      const seedId = seedResult.records[i].get('id')
      const seedKeywords = seedResult.records[i].get('keywords')
      
      console.log(`\n\nSeed ${i + 1}: ${seedId}`)
      console.log(`Keywords: ${seedKeywords}`)
      
      // Test with different similarity thresholds
      for (const threshold of [0.9, 0.8, 0.7, 0.6]) {
        const similarResult = await session.run(`
          MATCH (seed:EntitySummary {id: $seedId})
          MATCH (e:EntitySummary)
          WHERE e.id <> seed.id
            AND e.embedding IS NOT NULL
            AND seed.embedding IS NOT NULL
          WITH e, gds.similarity.cosine(seed.embedding, e.embedding) as similarity
          WHERE similarity > $threshold
          RETURN count(e) as count
        `, { seedId, threshold })
        
        const count = similarResult.records[0].get('count').low || 0
        console.log(`  Similarity > ${threshold}: ${count} entities`)
      }
      
      // Get top 5 similar entities regardless of threshold
      const topSimilarResult = await session.run(`
        MATCH (seed:EntitySummary {id: $seedId})
        MATCH (e:EntitySummary)
        WHERE e.id <> seed.id
          AND e.embedding IS NOT NULL
          AND seed.embedding IS NOT NULL
        WITH e, gds.similarity.cosine(seed.embedding, e.embedding) as similarity
        RETURN e.id as id, 
               similarity,
               e.pattern_signals as signals,
               e.keyword_frequencies as keywords
        ORDER BY similarity DESC
        LIMIT 5
      `, { seedId })
      
      console.log('\n  Top 5 similar entities:')
      topSimilarResult.records.forEach((record, idx) => {
        const similarity = record.get('similarity')
        const signals = record.get('signals')
        const keywords = record.get('keywords')
        console.log(`    ${idx + 1}. Similarity: ${similarity.toFixed(4)}`)
        console.log(`       Signals: ${signals}`)
        console.log(`       Keywords: ${keywords}`)
      })
    }
    
    // Check if GDS similarity function is working at all
    console.log('\n\n=== Testing GDS Function Directly ===')
    try {
      const testResult = await session.run(`
        MATCH (e1:EntitySummary), (e2:EntitySummary)
        WHERE e1.embedding IS NOT NULL 
          AND e2.embedding IS NOT NULL
          AND e1.id <> e2.id
        WITH e1, e2, gds.similarity.cosine(e1.embedding, e2.embedding) as sim
        RETURN avg(sim) as avgSim, min(sim) as minSim, max(sim) as maxSim
        LIMIT 1
      `)
      
      if (testResult.records.length > 0) {
        const record = testResult.records[0]
        console.log(`Average similarity: ${record.get('avgSim')}`)
        console.log(`Min similarity: ${record.get('minSim')}`)
        console.log(`Max similarity: ${record.get('maxSim')}`)
      }
    } catch (error) {
      console.error('GDS function error:', error.message)
    }
    
    await session.close()
  } finally {
    await driver.close()
  }
}

testSemanticSimilarity().catch(console.error)