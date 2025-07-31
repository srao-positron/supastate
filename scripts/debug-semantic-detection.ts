#!/usr/bin/env npx tsx

/**
 * Debug why semantic detection isn't creating patterns
 */

import * as dotenv from 'dotenv'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
)

async function debugSemanticDetection() {
  const session = driver.session()
  
  try {
    console.log('=== Debugging Semantic Pattern Detection ===\n')
    
    // 1. Check if we have embeddings
    const embeddingCheck = await session.run(`
      MATCH (e:EntitySummary)
      WHERE e.embedding IS NOT NULL
      RETURN count(e) as withEmbedding
    `)
    console.log(`EntitySummaries with embeddings: ${embeddingCheck.records[0].get('withEmbedding').low || 0}`)
    
    // 2. Check if we have debugging signals
    const debugSignals = await session.run(`
      MATCH (e:EntitySummary)
      WHERE e.pattern_signals CONTAINS '"is_debugging":true'
      RETURN count(e) as debugCount
    `)
    console.log(`EntitySummaries with debugging signals: ${debugSignals.records[0].get('debugCount').low || 0}`)
    
    // 3. Check if both conditions are met
    const debugWithEmbedding = await session.run(`
      MATCH (e:EntitySummary)
      WHERE e.pattern_signals CONTAINS '"is_debugging":true'
        AND e.embedding IS NOT NULL
      RETURN count(e) as count
    `)
    console.log(`Debugging entities with embeddings: ${debugWithEmbedding.records[0].get('count').low || 0}`)
    
    // 4. Try a simple GDS query
    console.log('\nTesting GDS cosine similarity...')
    try {
      const gdsTest = await session.run(`
        MATCH (e1:EntitySummary), (e2:EntitySummary)
        WHERE e1.id <> e2.id
          AND e1.embedding IS NOT NULL
          AND e2.embedding IS NOT NULL
        WITH e1, e2, gds.similarity.cosine(e1.embedding, e2.embedding) as similarity
        WHERE similarity > 0.9
        RETURN count(*) as highSimilarityPairs
        LIMIT 1
      `)
      console.log(`High similarity pairs (>0.9): ${gdsTest.records[0].get('highSimilarityPairs').low || 0}`)
    } catch (e) {
      console.error('GDS test failed:', e.message)
    }
    
    // 5. Check embedding format
    const sampleEmbedding = await session.run(`
      MATCH (e:EntitySummary)
      WHERE e.embedding IS NOT NULL
      RETURN e.embedding as embedding, size(e.embedding) as size
      LIMIT 1
    `)
    
    if (sampleEmbedding.records.length > 0) {
      const embedding = sampleEmbedding.records[0].get('embedding')
      const size = sampleEmbedding.records[0].get('size')
      console.log(`\nEmbedding size: ${size}`)
      console.log(`Embedding type: ${typeof embedding}`)
      console.log(`Is array: ${Array.isArray(embedding)}`)
      if (Array.isArray(embedding)) {
        console.log(`First 5 values: ${embedding.slice(0, 5).join(', ')}`)
      }
    }
    
    // 6. Look at keyword patterns vs semantic
    const keywordPatterns = await session.run(`
      MATCH (p:PatternSummary)
      WHERE p.metadata CONTAINS '"detectionMethod":"keyword"'
      RETURN count(p) as count
    `)
    console.log(`\nKeyword-based patterns: ${keywordPatterns.records[0].get('count').low || 0}`)
    
    const semanticPatterns = await session.run(`
      MATCH (p:PatternSummary)
      WHERE p.metadata CONTAINS '"detectionMethod":"semantic"'
      RETURN count(p) as count
    `)
    console.log(`Semantic-based patterns: ${semanticPatterns.records[0].get('count').low || 0}`)
    
    // 7. Check pattern_signals format
    const signalSample = await session.run(`
      MATCH (e:EntitySummary)
      WHERE e.pattern_signals IS NOT NULL
      RETURN e.pattern_signals as signals
      LIMIT 3
    `)
    
    console.log('\nSample pattern_signals:')
    signalSample.records.forEach((record, idx) => {
      console.log(`${idx + 1}. ${record.get('signals')}`)
    })
    
  } finally {
    await session.close()
    await driver.close()
  }
}

debugSemanticDetection().catch(console.error)