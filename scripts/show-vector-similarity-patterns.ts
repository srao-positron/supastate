#!/usr/bin/env npx tsx

/**
 * Show patterns found by vector similarity
 */

import * as dotenv from 'dotenv'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
)

async function showVectorSimilarityPatterns() {
  const session = driver.session()
  
  try {
    console.log('=== Triggering Pattern Processor ===\n')
    
    // Trigger pattern processor
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
    console.log('Batch ID:', result.batchId)
    
    // Wait for processing
    console.log('\nWaiting 10 seconds for processing...')
    await new Promise(resolve => setTimeout(resolve, 10000))
    
    // Get patterns from this batch
    const patternsResult = await session.run(`
      MATCH (p:PatternSummary)
      WHERE p.batch_id = $batchId
      RETURN p
      ORDER BY p.frequency DESC
    `, { batchId: result.batchId })
    
    console.log(`\n=== Found ${patternsResult.records.length} patterns from this run ===\n`)
    
    if (patternsResult.records.length === 0) {
      // Try getting recent patterns instead
      console.log('No patterns from this batch, showing recent semantic patterns...\n')
      
      const recentResult = await session.run(`
        MATCH (p:PatternSummary)
        WHERE p.metadata CONTAINS '"detectionMethod":"semantic'
          AND p.last_updated > datetime() - duration('PT1H')
        RETURN p
        ORDER BY p.last_updated DESC
        LIMIT 5
      `)
      
      recentResult.records.forEach((record, idx) => {
        showPattern(record, idx + 1)
      })
    } else {
      patternsResult.records.forEach((record, idx) => {
        showPattern(record, idx + 1)
      })
    }
    
    // Show example of entities in a pattern
    console.log('\n=== Example: Entities in a Semantic Pattern ===\n')
    
    // Get a pattern with high frequency
    const examplePattern = await session.run(`
      MATCH (p:PatternSummary)
      WHERE p.pattern_name = 'debugging-session-semantic'
        AND p.frequency > 10
      RETURN p
      ORDER BY p.frequency DESC
      LIMIT 1
    `)
    
    if (examplePattern.records.length > 0) {
      const pattern = examplePattern.records[0].get('p').properties
      let meta = {}
      let scope = {}
      
      try {
        if (pattern.metadata) meta = JSON.parse(pattern.metadata)
        if (pattern.scope_data) scope = JSON.parse(pattern.scope_data)
      } catch (e) {}
      
      console.log(`Pattern: ${pattern.pattern_name}`)
      console.log(`Project: ${scope.project || 'unknown'}`)
      console.log(`Frequency: ${pattern.frequency} entities`)
      console.log(`Average Similarity: ${meta.avgSimilarity || 'N/A'}`)
      
      // Show some sample entities if available
      if (meta.sampleEntityIds && Array.isArray(meta.sampleEntityIds)) {
        console.log(`\nSample entities in this pattern:`)
        
        for (const entityId of meta.sampleEntityIds.slice(0, 3)) {
          const entityResult = await session.run(`
            MATCH (e:EntitySummary {id: $entityId})
            MATCH (m:Memory {id: e.entity_id})
            RETURN e.entity_id as id, 
                   substring(m.content, 0, 100) as preview,
                   e.pattern_signals as signals
            LIMIT 1
          `, { entityId })
          
          if (entityResult.records.length > 0) {
            const record = entityResult.records[0]
            console.log(`\n- ${record.get('id')}`)
            console.log(`  Preview: "${record.get('preview')}..."`)
          }
        }
      }
    }
    
    // Show proof of vector similarity
    console.log('\n\n=== Proof: Vector Similarities Between Pattern Members ===\n')
    
    // Pick two entities from a semantic pattern and show their similarity
    const proofResult = await session.run(`
      MATCH (p:PatternSummary)
      WHERE p.metadata CONTAINS '"sampleEntityIds"'
        AND p.pattern_name = 'debugging-session-semantic'
      RETURN p.metadata as metadata
      LIMIT 1
    `)
    
    if (proofResult.records.length > 0) {
      const metadata = proofResult.records[0].get('metadata')
      try {
        const meta = JSON.parse(metadata)
        if (meta.sampleEntityIds && meta.sampleEntityIds.length >= 2) {
          const id1 = meta.sampleEntityIds[0]
          const id2 = meta.sampleEntityIds[1]
          
          const similarityResult = await session.run(`
            MATCH (e1:EntitySummary {id: $id1})
            MATCH (e2:EntitySummary {id: $id2})
            RETURN vector.similarity.cosine(e1.embedding, e2.embedding) as similarity,
                   e1.entity_id as entity1,
                   e2.entity_id as entity2
          `, { id1, id2 })
          
          if (similarityResult.records.length > 0) {
            const record = similarityResult.records[0]
            console.log(`Entity 1: ${record.get('entity1')}`)
            console.log(`Entity 2: ${record.get('entity2')}`)
            console.log(`Vector Similarity: ${record.get('similarity').toFixed(4)}`)
            console.log('\nThese entities are grouped together because their embeddings are similar!')
          }
        }
      } catch (e) {}
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

function showPattern(record: any, idx: number) {
  const pattern = record.get('p').properties
  let meta = {}
  let scope = {}
  
  try {
    if (pattern.metadata) meta = JSON.parse(pattern.metadata)
    if (pattern.scope_data) scope = JSON.parse(pattern.scope_data)
  } catch (e) {}
  
  console.log(`${idx}. ${pattern.pattern_type}/${pattern.pattern_name}`)
  console.log(`   Project: ${scope.project || 'unknown'}`)
  console.log(`   Period: ${scope.period || 'unknown'}`)
  console.log(`   Frequency: ${pattern.frequency} entities`)
  console.log(`   Confidence: ${pattern.confidence}`)
  console.log(`   Detection Method: ${meta.detectionMethod || 'unknown'}`)
  console.log(`   Average Similarity: ${meta.avgSimilarity || 'N/A'}`)
  if (pattern.batch_id) {
    console.log(`   Batch: ${pattern.batch_id}`)
  }
  console.log()
}

showVectorSimilarityPatterns().catch(console.error)