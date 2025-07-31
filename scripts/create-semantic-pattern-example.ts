#!/usr/bin/env npx tsx

/**
 * Create a semantic pattern to demonstrate vector similarity
 */

import * as dotenv from 'dotenv'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
)

async function createSemanticPatternExample() {
  const session = driver.session()
  
  try {
    console.log('=== Creating Semantic Pattern from Vector Similarity ===\n')
    
    // Get a debugging seed
    const seedResult = await session.run(`
      MATCH (e:EntitySummary)
      WHERE e.pattern_signals CONTAINS '"is_debugging":true'
        AND e.embedding IS NOT NULL
        AND e.project_name = 'maxwell-edison'
      RETURN e.id as id
      LIMIT 1
    `)
    
    const seedId = seedResult.records[0].get('id')
    
    // Find similar entities
    const similarResult = await session.run(`
      MATCH (seed:EntitySummary {id: $seedId})
      MATCH (e:EntitySummary)
      WHERE e.id <> seed.id
        AND e.embedding IS NOT NULL
        AND e.project_name = 'maxwell-edison'
        AND e.user_id = seed.user_id
        AND vector.similarity.cosine(seed.embedding, e.embedding) > 0.7
      WITH e, 
           vector.similarity.cosine(seed.embedding, e.embedding) as similarity,
           toString(date(e.created_at)) as day
      RETURN e.id as id,
             e.entity_id as entityId,
             similarity,
             day
      ORDER BY similarity DESC
      LIMIT 50
    `, { seedId })
    
    console.log(`Found ${similarResult.records.length} similar entities\n`)
    
    // Show top 5 with their content
    console.log('Top 5 semantically similar debugging sessions:')
    
    for (let i = 0; i < Math.min(5, similarResult.records.length); i++) {
      const record = similarResult.records[i]
      const entityId = record.get('entityId')
      const similarity = record.get('similarity')
      
      // Get memory content
      const memoryResult = await session.run(`
        MATCH (m:Memory {id: $entityId})
        RETURN substring(m.content, 0, 150) as preview
      `, { entityId })
      
      const preview = memoryResult.records[0]?.get('preview') || 'N/A'
      
      console.log(`\n${i + 1}. Similarity: ${similarity.toFixed(4)}`)
      console.log(`   Entity: ${entityId}`)
      console.log(`   Preview: "${preview}..."`)
    }
    
    // Create the pattern
    const batchId = 'demo-' + Date.now()
    const entities = similarResult.records.map(r => r.get('id'))
    const avgSimilarity = similarResult.records.reduce((sum, r) => sum + r.get('similarity'), 0) / similarResult.records.length
    
    await session.run(`
      CREATE (p:PatternSummary {
        id: $id,
        pattern_type: 'debugging',
        pattern_name: 'debugging-session-semantic',
        scope_id: 'a02c3fed-3a24-442f-becc-97bac8b75e90',
        scope_data: $scopeData,
        confidence: $confidence,
        frequency: $frequency,
        first_detected: datetime(),
        last_updated: datetime(),
        batch_id: $batchId,
        metadata: $metadata
      })
      RETURN p
    `, {
      id: 'semantic-demo-' + Date.now(),
      scopeData: JSON.stringify({
        project: 'maxwell-edison',
        period: 'week-2025-07-01'
      }),
      confidence: Math.min(avgSimilarity * 1.1, 0.95),
      frequency: similarResult.records.length,
      metadata: JSON.stringify({
        detectionMethod: 'semantic-vector-search',
        avgSimilarity: avgSimilarity,
        temporalGrouping: 'weekly',
        sampleEntityIds: entities.slice(0, 5),
        demo: true
      }),
      batchId
    })
    
    console.log(`\n\n✅ Created semantic pattern with ${similarResult.records.length} entities`)
    console.log(`Average similarity: ${avgSimilarity.toFixed(4)}`)
    console.log('\nThis pattern groups debugging sessions that are semantically similar,')
    console.log('even if they use different words or describe different types of errors!')
    
  } finally {
    await session.close()
    await driver.close()
  }
}

createSemanticPatternExample().catch(console.error)