#!/usr/bin/env npx tsx

/**
 * Test all pattern types to ensure they're being detected
 */

import * as dotenv from 'dotenv'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
)

async function testAllPatternTypes() {
  const session = driver.session()
  
  try {
    console.log('=== Testing All Pattern Types ===\n')
    
    // Check what pattern signals we have
    const signalsResult = await session.run(`
      MATCH (e:EntitySummary)
      WITH 
        sum(CASE WHEN e.pattern_signals CONTAINS '"is_debugging":true' THEN 1 ELSE 0 END) as debugging,
        sum(CASE WHEN e.pattern_signals CONTAINS '"is_learning":true' THEN 1 ELSE 0 END) as learning,
        sum(CASE WHEN e.pattern_signals CONTAINS '"is_refactoring":true' THEN 1 ELSE 0 END) as refactoring,
        sum(CASE WHEN e.pattern_signals CONTAINS '"is_problem_solving":true' THEN 1 ELSE 0 END) as problemSolving,
        count(e) as total
      RETURN debugging, learning, refactoring, problemSolving, total
    `)
    
    const signals = signalsResult.records[0]
    console.log('EntitySummary signal distribution:')
    console.log(`  Debugging: ${signals.get('debugging').low || 0}`)
    console.log(`  Learning: ${signals.get('learning').low || 0}`)
    console.log(`  Refactoring: ${signals.get('refactoring').low || 0}`)
    console.log(`  Problem Solving: ${signals.get('problemSolving').low || 0}`)
    console.log(`  Total: ${signals.get('total').low || 0}`)
    
    // Trigger pattern processor
    console.log('\n\nTriggering pattern processor...')
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
    console.log('\nWaiting 20 seconds for processing...')
    await new Promise(resolve => setTimeout(resolve, 20000))
    
    // Check patterns created
    console.log('\n=== Patterns Created ===')
    
    const patternTypes = [
      'debugging',
      'learning',
      'refactoring',
      'problem_solving',
      'temporal',
      'semantic_cluster',
      'memory_code_relationship'
    ]
    
    for (const type of patternTypes) {
      const typeResult = await session.run(`
        MATCH (p:PatternSummary)
        WHERE p.pattern_type = $type
          AND p.batch_id = $batchId
        RETURN p
        ORDER BY p.frequency DESC
      `, { type, batchId: result.batchId })
      
      console.log(`\n${type.toUpperCase()} patterns: ${typeResult.records.length}`)
      
      if (typeResult.records.length > 0) {
        // Show first pattern as example
        const pattern = typeResult.records[0].get('p').properties
        let meta = {}
        try {
          if (pattern.metadata) meta = JSON.parse(pattern.metadata)
        } catch (e) {}
        
        console.log(`  Example: ${pattern.pattern_name}`)
        console.log(`    Frequency: ${pattern.frequency}`)
        console.log(`    Confidence: ${pattern.confidence}`)
        console.log(`    Detection: ${meta.detectionMethod || 'unknown'}`)
        
        if (meta.avgSimilarity) {
          console.log(`    Avg Similarity: ${meta.avgSimilarity.toFixed(3)}`)
        }
      }
    }
    
    // Check total patterns
    const totalResult = await session.run(`
      MATCH (p:PatternSummary)
      WHERE p.batch_id = $batchId
      RETURN count(p) as total
    `, { batchId: result.batchId })
    
    console.log(`\nTotal patterns created: ${totalResult.records[0].get('total').low || 0}`)
    
    // Sample some interesting patterns
    console.log('\n\n=== Interesting Pattern Examples ===')
    
    // Memory-code relationships
    const memCodeResult = await session.run(`
      MATCH (p:PatternSummary)
      WHERE p.pattern_type = 'memory_code_relationship'
      RETURN p
      ORDER BY p.frequency DESC
      LIMIT 1
    `)
    
    if (memCodeResult.records.length > 0) {
      const pattern = memCodeResult.records[0].get('p').properties
      let meta = {}
      try {
        if (pattern.metadata) meta = JSON.parse(pattern.metadata)
      } catch (e) {}
      
      console.log('\nMemory-Code Relationship:')
      console.log(`  Project: ${JSON.parse(pattern.scope_data || '{}').project || 'unknown'}`)
      console.log(`  Connections: ${pattern.frequency}`)
      console.log(`  Avg Similarity: ${meta.avgSimilarity?.toFixed(3) || 'N/A'}`)
      
      if (meta.samples && meta.samples.length > 0) {
        console.log(`  Example connection:`)
        console.log(`    Memory: ${meta.samples[0].memory}`)
        console.log(`    Code: ${meta.samples[0].code}`)
        console.log(`    Similarity: ${meta.samples[0].similarity?.toFixed(3)}`)
      }
    }
    
    // Semantic clusters
    const clusterResult = await session.run(`
      MATCH (p:PatternSummary)
      WHERE p.pattern_type = 'semantic_cluster'
      RETURN p
      ORDER BY p.frequency DESC
      LIMIT 1
    `)
    
    if (clusterResult.records.length > 0) {
      const pattern = clusterResult.records[0].get('p').properties
      let meta = {}
      try {
        if (pattern.metadata) meta = JSON.parse(pattern.metadata)
      } catch (e) {}
      
      console.log('\nSemantic Cluster:')
      console.log(`  Project: ${JSON.parse(pattern.scope_data || '{}').project || pattern.project || 'unknown'}`)
      console.log(`  Cluster Size: ${pattern.frequency}`)
      console.log(`  Avg Similarity: ${meta.avgSimilarity?.toFixed(3) || 'N/A'}`)
    }
    
    // Temporal patterns
    const temporalResult = await session.run(`
      MATCH (p:PatternSummary)
      WHERE p.pattern_type = 'temporal'
      RETURN p
      ORDER BY p.frequency DESC
      LIMIT 1
    `)
    
    if (temporalResult.records.length > 0) {
      const pattern = temporalResult.records[0].get('p').properties
      console.log('\nTemporal Pattern:')
      console.log(`  Project: ${JSON.parse(pattern.scope_data || '{}').project || 'unknown'}`)
      console.log(`  Activities in session: ${pattern.frequency}`)
      console.log(`  Period: ${pattern.hour || pattern.day || 'unknown'}`)
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

testAllPatternTypes().catch(console.error)