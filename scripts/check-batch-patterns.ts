#!/usr/bin/env npx tsx

/**
 * Check patterns by batch ID
 */

import * as dotenv from 'dotenv'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
)

async function checkBatchPatterns() {
  const session = driver.session()
  
  try {
    console.log('=== Checking Patterns by Batch ID ===\n')
    
    // Check the batch IDs mentioned in the logs
    const batchIds = [
      '2e5f07b6-30a0-4051-9dc6-0049cbfb14bf',  // Most recent test
      'c4141a8e-398a-4dcf-8b5e-e748a3bb6155',
      'a66759ad-e05b-4709-8ff5-6a81675e1da2',
      'e0742aa7-a1ba-492d-99c8-4cb67dcc1b3d',
      '9e5f7470-ca25-4743-aec3-f719f3f82239'
    ]
    
    for (const batchId of batchIds) {
      const result = await session.run(`
        MATCH (p:PatternSummary)
        WHERE p.batch_id = $batchId
        RETURN p
      `, { batchId })
      
      if (result.records.length > 0) {
        console.log(`\nBatch ${batchId}: ${result.records.length} patterns`)
        result.records.forEach(record => {
          const pattern = record.get('p').properties
          console.log(`  - ${pattern.pattern_type}/${pattern.pattern_name} (freq: ${pattern.frequency})`)
        })
      } else {
        console.log(`\nBatch ${batchId}: No patterns found`)
      }
    }
    
    // Check if patterns are being created without batch IDs
    const noBatchResult = await session.run(`
      MATCH (p:PatternSummary)
      WHERE p.batch_id IS NULL
        AND p.last_updated > datetime() - duration('PT2H')
      RETURN p
      ORDER BY p.last_updated DESC
      LIMIT 10
    `)
    
    if (noBatchResult.records.length > 0) {
      console.log(`\n\nPatterns without batch_id (last 2 hours): ${noBatchResult.records.length}`)
      noBatchResult.records.forEach(record => {
        const pattern = record.get('p').properties
        console.log(`  - ${pattern.pattern_type}/${pattern.pattern_name} (updated: ${pattern.last_updated})`)
      })
    }
    
    // Check all patterns in the last 10 minutes
    const recentResult = await session.run(`
      MATCH (p:PatternSummary)
      WHERE p.last_updated > datetime() - duration('PT10M')
      RETURN p
      ORDER BY p.last_updated DESC
    `)
    
    console.log(`\n\nPatterns created/updated in last 10 minutes: ${recentResult.records.length}`)
    recentResult.records.forEach(record => {
      const pattern = record.get('p').properties
      let meta: any = {}
      try {
        if (pattern.metadata) meta = JSON.parse(pattern.metadata)
      } catch (e) {}
      console.log(`  - ${pattern.pattern_type}/${pattern.pattern_name}`)
      console.log(`    Batch: ${pattern.batch_id || 'none'}`)
      console.log(`    Detection: ${meta.detectionMethod || 'unknown'}`)
      console.log(`    Updated: ${pattern.last_updated}`)
    })
    
  } finally {
    await session.close()
    await driver.close()
  }
}

checkBatchPatterns().catch(console.error)