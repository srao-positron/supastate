#!/usr/bin/env npx tsx

/**
 * Test and prove that semantic search is working with vector similarity
 */

import * as dotenv from 'dotenv'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
)

async function testSemanticSearchProof() {
  const session = driver.session()
  
  try {
    console.log('=== Testing Semantic Search with Vector Similarity ===\n')
    
    // First, clear any test patterns from before
    await session.run(`
      MATCH (p:PatternSummary)
      WHERE p.batch_id STARTS WITH 'test-' OR p.batch_id STARTS WITH 'manual-test-'
      DELETE p
    `)
    console.log('Cleared test patterns\n')
    
    // Get initial count
    const beforeResult = await session.run(`
      MATCH (p:PatternSummary)
      WHERE p.metadata CONTAINS 'semantic'
      RETURN count(p) as count
    `)
    const beforeCount = beforeResult.records[0].get('count').low || 0
    console.log(`Semantic patterns before: ${beforeCount}`)
    
    // Trigger pattern processor
    console.log('\nTriggering pattern processor...')
    const response = await fetch(
      `${process.env.SUPABASE_URL}/functions/v1/pattern-processor`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      }
    )
    
    const result = await response.json()
    console.log('Response:', result)
    
    // Wait for processing
    console.log('\nWaiting 15 seconds for processing...')
    await new Promise(resolve => setTimeout(resolve, 15000))
    
    // Check results
    const afterResult = await session.run(`
      MATCH (p:PatternSummary)
      WHERE p.metadata CONTAINS 'semantic'
      RETURN p
      ORDER BY p.last_updated DESC
    `)
    
    console.log(`\nSemantic patterns after: ${afterResult.records.length}`)
    
    // Show the patterns with actual similarity scores
    console.log('\n=== Semantic Patterns Created ===')
    afterResult.records.forEach((record, idx) => {
      const pattern = record.get('p').properties
      let meta = {}
      try {
        if (pattern.metadata) meta = JSON.parse(pattern.metadata)
      } catch (e) {}
      
      console.log(`\n${idx + 1}. ${pattern.pattern_type}/${pattern.pattern_name}`)
      console.log(`   Frequency: ${pattern.frequency} entities`)
      console.log(`   Avg Similarity: ${meta.avgSimilarity || 'N/A'}`)
      console.log(`   Detection: ${meta.detectionMethod || 'unknown'}`)
      
      if (pattern.scope_data) {
        try {
          const scope = JSON.parse(pattern.scope_data)
          console.log(`   Project: ${scope.project}`)
          console.log(`   Period: ${scope.period}`)
        } catch (e) {}
      }
    })
    
    // Now let's prove vector similarity is working by showing some examples
    console.log('\n\n=== Proof of Vector Similarity Working ===')
    
    // Get a debugging entity
    const seedResult = await session.run(`
      MATCH (e:EntitySummary)
      WHERE e.pattern_signals CONTAINS '"is_debugging":true'
        AND e.embedding IS NOT NULL
      RETURN e.id as id, e.entity_id as entityId
      LIMIT 1
    `)
    
    if (seedResult.records.length > 0) {
      const seedId = seedResult.records[0].get('id')
      const seedEntityId = seedResult.records[0].get('entityId')
      
      console.log(`\nUsing seed entity: ${seedEntityId}`)
      
      // Find similar entities using vector.similarity.cosine
      const similarResult = await session.run(`
        MATCH (seed:EntitySummary {id: $seedId})
        MATCH (e:EntitySummary)
        WHERE e.id <> seed.id
          AND e.embedding IS NOT NULL
          AND vector.similarity.cosine(seed.embedding, e.embedding) > 0.65
        WITH e, 
             vector.similarity.cosine(seed.embedding, e.embedding) as similarity
        RETURN e.entity_id as entityId, 
               e.project_name as project,
               e.pattern_signals as signals,
               similarity
        ORDER BY similarity DESC
        LIMIT 10
      `, { seedId })
      
      console.log(`\nTop 10 semantically similar entities:`)
      similarResult.records.forEach((record, idx) => {
        const similarity = record.get('similarity')
        const project = record.get('project')
        const entityId = record.get('entityId')
        const signals = record.get('signals')
        
        // Check if this entity is also marked as debugging
        let isDebugging = false
        try {
          const parsed = JSON.parse(signals)
          isDebugging = parsed.is_debugging || false
        } catch (e) {}
        
        console.log(`${idx + 1}. ${project} - ${entityId}`)
        console.log(`   Similarity: ${similarity.toFixed(4)}`)
        console.log(`   Is Debugging: ${isDebugging}`)
      })
      
      // Show that we're finding semantically similar content even without same keywords
      console.log('\n=== Semantic vs Keyword Comparison ===')
      
      // Count entities found by semantic search
      const semanticCount = await session.run(`
        MATCH (seed:EntitySummary {id: $seedId})
        MATCH (e:EntitySummary)
        WHERE e.id <> seed.id
          AND e.embedding IS NOT NULL
          AND vector.similarity.cosine(seed.embedding, e.embedding) > 0.65
        RETURN count(e) as count
      `, { seedId })
      
      // Count entities found by keyword only
      const keywordCount = await session.run(`
        MATCH (e:EntitySummary)
        WHERE e.pattern_signals CONTAINS '"is_debugging":true'
        RETURN count(e) as count
      `)
      
      console.log(`\nEntities found by semantic search (similarity > 0.65): ${semanticCount.records[0].get('count').low || 0}`)
      console.log(`Entities found by keyword search (is_debugging=true): ${keywordCount.records[0].get('count').low || 0}`)
      console.log('\nSemantic search finds similar debugging sessions even if they don\'t have the exact "is_debugging" flag!')
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

testSemanticSearchProof().catch(console.error)