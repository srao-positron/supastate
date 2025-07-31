#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
)

async function checkSeeds() {
  const session = driver.session()
  
  try {
    console.log('=== Checking Semantic Search Seeds ===\n')
    
    // Check for high-confidence debugging seeds
    const result = await session.run(`
      MATCH (e:EntitySummary)
      WHERE e.pattern_signals CONTAINS '"is_debugging":true'
        AND e.pattern_signals CONTAINS '"urgency_score":0.8'
      RETURN count(e) as count
    `)
    
    console.log('High-confidence debugging seeds (urgency=0.8):', result.records[0].get('count').low || 0)
    
    // Check urgency score distribution
    const urgencyResult = await session.run(`
      MATCH (e:EntitySummary)
      WHERE e.pattern_signals CONTAINS '"is_debugging":true'
      WITH e.pattern_signals as signals
      RETURN 
        CASE 
          WHEN signals CONTAINS '"urgency_score":0.8' THEN '0.8'
          WHEN signals CONTAINS '"urgency_score":0.5' THEN '0.5'
          ELSE 'other'
        END as urgency,
        count(*) as count
      ORDER BY urgency
    `)
    
    console.log('\nUrgency score distribution for debugging entities:')
    urgencyResult.records.forEach(record => {
      console.log(`  Urgency ${record.get('urgency')}: ${record.get('count').low || record.get('count')}`)
    })
    
    // Check if embeddings exist
    const embeddingResult = await session.run(`
      MATCH (e:EntitySummary)
      WHERE e.pattern_signals CONTAINS '"is_debugging":true'
      RETURN 
        e.embedding IS NOT NULL as hasEmbedding,
        count(e) as count
      ORDER BY hasEmbedding
    `)
    
    console.log('\nEmbedding availability:')
    embeddingResult.records.forEach(record => {
      const hasEmbedding = record.get('hasEmbedding')
      const count = record.get('count').low || record.get('count')
      console.log(`  ${hasEmbedding ? 'With' : 'Without'} embeddings: ${count}`)
    })
    
    // Sample some debugging entities to see their content
    const sampleResult = await session.run(`
      MATCH (e:EntitySummary)-[:SUMMARIZES]->(m:Memory)
      WHERE e.pattern_signals CONTAINS '"is_debugging":true'
      RETURN e.keyword_frequencies as keywords, 
             m.content as content,
             e.pattern_signals as signals
      LIMIT 3
    `)
    
    console.log('\nSample debugging entities:')
    sampleResult.records.forEach((record, idx) => {
      console.log(`\n${idx + 1}. Keywords:`, record.get('keywords'))
      console.log(`   Signals:`, record.get('signals'))
      console.log(`   Content preview:`, record.get('content')?.substring(0, 100) + '...')
    })
    
  } finally {
    await session.close()
    await driver.close()
  }
}

checkSeeds().catch(console.error)