#!/usr/bin/env npx tsx

/**
 * Create a test semantic pattern to verify the system works
 */

import * as dotenv from 'dotenv'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
)

async function createTestSemanticPattern() {
  const session = driver.session()
  
  try {
    console.log('=== Creating Test Semantic Pattern ===\n')
    
    // Check current semantic patterns
    const beforeResult = await session.run(`
      MATCH (p:PatternSummary)
      WHERE p.metadata CONTAINS 'semantic'
      RETURN count(p) as count
    `)
    
    const beforeCount = beforeResult.records[0].get('count').low || 0
    console.log(`Semantic patterns before: ${beforeCount}`)
    
    // Create a semantic pattern
    const batchId = 'manual-test-' + Date.now()
    const result = await session.run(`
      CREATE (p:PatternSummary {
        id: $id,
        pattern_type: 'debugging',
        pattern_name: 'debugging-session-semantic',
        scope_id: 'a02c3fed-3a24-442f-becc-97bac8b75e90',
        scope_data: $scopeData,
        confidence: 0.85,
        frequency: 15,
        first_detected: datetime(),
        last_validated: datetime(),
        last_updated: datetime(),
        batch_id: $batchId,
        metadata: $metadata
      })
      RETURN p
    `, {
      id: 'test-semantic-' + Date.now(),
      scopeData: JSON.stringify({
        project: 'supastate',
        period: 'week-2025-07-01'
      }),
      metadata: JSON.stringify({
        detectionMethod: 'semantic',
        avgSimilarity: 0.85,
        temporalGrouping: 'weekly',
        test: true,
        createdBy: 'manual-test'
      }),
      batchId
    })
    
    console.log('\nPattern created successfully!')
    
    // Check after
    const afterResult = await session.run(`
      MATCH (p:PatternSummary)
      WHERE p.metadata CONTAINS 'semantic'
      RETURN p
      ORDER BY p.last_updated DESC
      LIMIT 5
    `)
    
    console.log(`\nSemantic patterns after: ${afterResult.records.length}`)
    
    afterResult.records.forEach((record, idx) => {
      const pattern = record.get('p').properties
      console.log(`\n${idx + 1}. ${pattern.pattern_name}`)
      console.log(`   Confidence: ${pattern.confidence}`)
      console.log(`   Frequency: ${pattern.frequency}`)
      if (pattern.metadata) {
        try {
          const meta = JSON.parse(pattern.metadata)
          console.log(`   Created by: ${meta.createdBy || 'edge-function'}`)
        } catch (e) {}
      }
    })
    
  } finally {
    await session.close()
    await driver.close()
  }
}

createTestSemanticPattern().catch(console.error)