#!/usr/bin/env npx tsx

/**
 * Test pattern MERGE behavior
 */

import * as dotenv from 'dotenv'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
)

async function testPatternMerge() {
  const session = driver.session()
  
  try {
    console.log('=== Testing Pattern MERGE ===\n')
    
    // Test data
    const testPattern = {
      type: 'debugging',
      pattern: 'debugging-session-semantic',
      userId: 'a02c3fed-3a24-442f-becc-97bac8b75e90',
      project: 'maxwell-edison',
      week: '2025-07-01',
      confidence: 0.85,
      frequency: 74,
      metadata: {
        avgSimilarity: 0.7,
        detectionMethod: 'semantic',
        temporalGrouping: 'weekly'
      }
    }
    
    const batchId = 'test-merge-' + Date.now()
    const patternId = `${testPattern.type}-${testPattern.pattern}-${batchId}`
    const scopeData = JSON.stringify({
      project: testPattern.project,
      period: testPattern.week
    })
    
    console.log('Testing MERGE with:')
    console.log(`  Type: ${testPattern.type}`)
    console.log(`  Name: ${testPattern.pattern}`)
    console.log(`  Scope ID: ${testPattern.userId}`)
    console.log(`  Scope Data: ${scopeData}`)
    
    // First check if pattern exists
    const checkResult = await session.run(`
      MATCH (p:PatternSummary {
        pattern_type: $type,
        pattern_name: $pattern,
        scope_id: $scopeId,
        scope_data: $scopeData
      })
      RETURN p
    `, {
      type: testPattern.type,
      pattern: testPattern.pattern,
      scopeId: testPattern.userId,
      scopeData: scopeData
    })
    
    console.log(`\nExisting patterns found: ${checkResult.records.length}`)
    
    // Try the MERGE
    console.log('\nExecuting MERGE...')
    try {
      await session.run(`
        MERGE (p:PatternSummary {
          pattern_type: $type,
          pattern_name: $pattern,
          scope_id: $scopeId,
          scope_data: $scopeData
        })
        ON CREATE SET
          p.id = $patternId,
          p.confidence = $confidence,
          p.frequency = $frequency,
          p.first_detected = datetime(),
          p.last_validated = datetime(),
          p.last_updated = datetime(),
          p.batch_id = $batchId,
          p.metadata = $metadata
        ON MATCH SET
          p.frequency = p.frequency + $frequency,
          p.confidence = CASE 
            WHEN $confidence > p.confidence THEN $confidence 
            ELSE p.confidence 
          END,
          p.last_validated = datetime(),
          p.last_updated = datetime(),
          p.metadata = $metadata
      `, {
        patternId,
        type: testPattern.type,
        pattern: testPattern.pattern,
        confidence: testPattern.confidence,
        frequency: testPattern.frequency,
        scopeId: testPattern.userId,
        scopeData: scopeData,
        metadata: JSON.stringify(testPattern.metadata),
        batchId
      })
      
      console.log('MERGE succeeded!')
      
      // Check what was created/updated
      const verifyResult = await session.run(`
        MATCH (p:PatternSummary)
        WHERE p.batch_id = $batchId OR 
              (p.pattern_type = $type AND p.pattern_name = $pattern AND p.scope_id = $scopeId AND p.scope_data = $scopeData)
        RETURN p
      `, {
        batchId,
        type: testPattern.type,
        pattern: testPattern.pattern,
        scopeId: testPattern.userId,
        scopeData: scopeData
      })
      
      console.log(`\nPatterns after MERGE: ${verifyResult.records.length}`)
      verifyResult.records.forEach(record => {
        const p = record.get('p').properties
        console.log(`  - Frequency: ${p.frequency}`)
        console.log(`    Batch ID: ${p.batch_id}`)
        console.log(`    Updated: ${p.last_updated}`)
      })
      
    } catch (error) {
      console.error('MERGE failed:', error.message)
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

testPatternMerge().catch(console.error)