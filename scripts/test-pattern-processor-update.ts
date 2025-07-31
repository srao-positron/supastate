#!/usr/bin/env npx tsx

/**
 * Test that the updated pattern processor creates semantic patterns
 */

import * as dotenv from 'dotenv'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
)

async function testPatternProcessor() {
  const session = driver.session()
  
  try {
    console.log('=== Testing Pattern Processor Updates ===\n')
    
    // First check how many patterns we have before
    const beforeResult = await session.run(`
      MATCH (p:PatternSummary)
      WHERE p.metadata CONTAINS 'semantic'
      RETURN count(p) as count
    `)
    
    const beforeCount = beforeResult.records[0].get('count').low || 0
    console.log(`Semantic patterns before: ${beforeCount}`)
    
    // Trigger the pattern processor
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
    
    // Wait a bit for processing
    console.log('\nWaiting 10 seconds for processing...')
    await new Promise(resolve => setTimeout(resolve, 10000))
    
    // Check patterns after
    const afterResult = await session.run(`
      MATCH (p:PatternSummary)
      WHERE p.metadata CONTAINS 'semantic'
      RETURN p
      ORDER BY p.last_updated DESC
      LIMIT 10
    `)
    
    console.log(`\nSemantic patterns found: ${afterResult.records.length}`)
    
    afterResult.records.forEach((record, idx) => {
      const pattern = record.get('p').properties
      console.log(`\n${idx + 1}. ${pattern.pattern_type} - ${pattern.pattern_name}`)
      console.log(`   Confidence: ${pattern.confidence}`)
      console.log(`   Frequency: ${pattern.frequency}`)
      
      if (pattern.metadata) {
        try {
          const meta = JSON.parse(pattern.metadata)
          console.log(`   Avg Similarity: ${meta.avgSimilarity}`)
          console.log(`   Temporal Grouping: ${meta.temporalGrouping}`)
        } catch (e) {}
      }
      
      if (pattern.scope_data) {
        try {
          const scope = JSON.parse(pattern.scope_data)
          console.log(`   Project: ${scope.project}`)
          console.log(`   Period: ${scope.period}`)
        } catch (e) {}
      }
    })
    
    const newCount = afterResult.records.length - beforeCount
    if (newCount > 0) {
      console.log(`\n✅ Success! Created ${newCount} new semantic patterns`)
    } else {
      console.log('\n⚠️  No new semantic patterns created')
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

testPatternProcessor().catch(console.error)