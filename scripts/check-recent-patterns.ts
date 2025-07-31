#!/usr/bin/env npx tsx

/**
 * Check recently created patterns
 */

import * as dotenv from 'dotenv'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
)

async function checkRecentPatterns() {
  const session = driver.session()
  
  try {
    console.log('=== Checking Recent Patterns ===\n')
    
    // Get patterns created in the last hour
    const result = await session.run(`
      MATCH (p:PatternSummary)
      WHERE p.last_updated > datetime() - duration('PT1H')
      RETURN p
      ORDER BY p.last_updated DESC
    `)
    
    console.log(`Found ${result.records.length} patterns created/updated in the last hour\n`)
    
    const semanticPatterns = []
    const keywordPatterns = []
    
    result.records.forEach(record => {
      const pattern = record.get('p').properties
      let detectionMethod = 'unknown'
      
      if (pattern.metadata) {
        try {
          const meta = JSON.parse(pattern.metadata)
          detectionMethod = meta.detectionMethod || 'unknown'
        } catch (e) {}
      }
      
      if (pattern.pattern_name === 'debugging-session-semantic' || detectionMethod === 'semantic') {
        semanticPatterns.push(pattern)
      } else if (detectionMethod === 'keyword') {
        keywordPatterns.push(pattern)
      }
    })
    
    console.log(`Semantic patterns: ${semanticPatterns.length}`)
    console.log(`Keyword patterns: ${keywordPatterns.length}`)
    
    if (semanticPatterns.length > 0) {
      console.log('\nRecent semantic patterns:')
      semanticPatterns.slice(0, 10).forEach((p, idx) => {
        console.log(`\n${idx + 1}. ${p.pattern_type} - ${p.pattern_name}`)
        console.log(`   Created: ${p.first_detected || p.created_at}`)
        console.log(`   Updated: ${p.last_updated}`)
        console.log(`   Frequency: ${p.frequency}`)
        console.log(`   Batch ID: ${p.batch_id || 'none'}`)
        
        if (p.scope_data) {
          try {
            const scope = JSON.parse(p.scope_data)
            console.log(`   Project: ${scope.project}`)
            console.log(`   Period: ${scope.period}`)
          } catch (e) {}
        }
      })
    }
    
    // Check for patterns without metadata
    const noMetadataResult = await session.run(`
      MATCH (p:PatternSummary)
      WHERE p.metadata IS NULL
      RETURN count(p) as count
    `)
    
    const noMetadataCount = noMetadataResult.records[0].get('count').low || 0
    console.log(`\nPatterns without metadata: ${noMetadataCount}`)
    
    // Check unique batch IDs
    const batchResult = await session.run(`
      MATCH (p:PatternSummary)
      WHERE p.batch_id IS NOT NULL
        AND p.last_updated > datetime() - duration('PT1H')
      RETURN DISTINCT p.batch_id as batchId, count(p) as count
      ORDER BY p.batch_id DESC
    `)
    
    if (batchResult.records.length > 0) {
      console.log('\nRecent batch IDs:')
      batchResult.records.forEach(record => {
        console.log(`  ${record.get('batchId')}: ${record.get('count').low || 0} patterns`)
      })
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

checkRecentPatterns().catch(console.error)