#!/usr/bin/env npx tsx

/**
 * Check pattern metadata to see if semantic patterns are being overwritten
 */

import * as dotenv from 'dotenv'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
)

async function checkPatternMetadata() {
  const session = driver.session()
  
  try {
    console.log('=== Checking Pattern Metadata ===\n')
    
    // Check all debugging patterns
    const result = await session.run(`
      MATCH (p:PatternSummary)
      WHERE p.pattern_type = 'debugging'
      RETURN 
        p.pattern_name as name,
        p.metadata as metadata,
        p.frequency as frequency,
        p.batch_id as batchId,
        p.last_updated as lastUpdated,
        p.scope_data as scopeData
      ORDER BY p.last_updated DESC
      LIMIT 20
    `)
    
    console.log(`Found ${result.records.length} debugging patterns\n`)
    
    const semanticPatterns = []
    const keywordPatterns = []
    
    result.records.forEach(record => {
      const metadata = record.get('metadata')
      const name = record.get('name')
      const frequency = record.get('frequency')
      const batchId = record.get('batchId')
      const scopeData = record.get('scopeData')
      
      let detectionMethod = 'unknown'
      if (metadata) {
        try {
          const meta = JSON.parse(metadata)
          detectionMethod = meta.detectionMethod || 'unknown'
        } catch (e) {}
      }
      
      const pattern = {
        name,
        frequency,
        detectionMethod,
        batchId,
        scopeData
      }
      
      if (name === 'debugging-session-semantic' || detectionMethod === 'semantic') {
        semanticPatterns.push(pattern)
      } else if (detectionMethod === 'keyword') {
        keywordPatterns.push(pattern)
      }
    })
    
    console.log(`Semantic patterns: ${semanticPatterns.length}`)
    console.log(`Keyword patterns: ${keywordPatterns.length}`)
    
    if (semanticPatterns.length > 0) {
      console.log('\nSemantic patterns found:')
      semanticPatterns.forEach((p, idx) => {
        console.log(`${idx + 1}. ${p.name} (freq: ${p.frequency}, batch: ${p.batchId})`)
        if (p.scopeData) {
          try {
            const scope = JSON.parse(p.scopeData)
            console.log(`   Project: ${scope.project}, Period: ${scope.period}`)
          } catch (e) {}
        }
      })
    }
    
    // Check if there are any patterns with "debugging-session-semantic" name
    const semanticNamedPatterns = await session.run(`
      MATCH (p:PatternSummary)
      WHERE p.pattern_name = 'debugging-session-semantic'
      RETURN count(p) as count
    `)
    
    console.log(`\nPatterns with name 'debugging-session-semantic': ${semanticNamedPatterns.records[0].get('count').low || 0}`)
    
    // Check recent batch IDs
    console.log('\nRecent batch IDs:')
    const batchResult = await session.run(`
      MATCH (p:PatternSummary)
      WHERE p.batch_id IS NOT NULL
      RETURN distinct p.batch_id as batchId, count(p) as patternCount
      ORDER BY p.batch_id DESC
      LIMIT 5
    `)
    
    batchResult.records.forEach(record => {
      console.log(`  ${record.get('batchId')}: ${record.get('patternCount').low || 0} patterns`)
    })
    
  } finally {
    await session.close()
    await driver.close()
  }
}

checkPatternMetadata().catch(console.error)