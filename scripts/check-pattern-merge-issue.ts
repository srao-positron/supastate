#!/usr/bin/env npx tsx

/**
 * Check if MERGE is causing pattern creation issues
 */

import * as dotenv from 'dotenv'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
)

async function checkPatternMergeIssue() {
  const session = driver.session()
  
  try {
    console.log('=== Checking Pattern MERGE Issue ===\n')
    
    // Check patterns by scope_data
    const scopeDataValues = [
      '{"project":"maxwell-edison","period":"week-2025-07-01"}',
      '{"project":"supastate","period":"week-2025-07-01"}',
      '{"project":"hawking-edison","period":"week-2025-07-01"}',
      '{"project":"cdk","period":"week-2025-07-01"}'
    ]
    
    for (const scopeData of scopeDataValues) {
      const result = await session.run(`
        MATCH (p:PatternSummary)
        WHERE p.scope_data = $scopeData
          AND p.pattern_type = 'debugging'
        RETURN p
      `, { scopeData })
      
      if (result.records.length > 0) {
        const parsed = JSON.parse(scopeData)
        console.log(`\n${parsed.project} / ${parsed.period}: ${result.records.length} patterns`)
        
        result.records.forEach(record => {
          const pattern = record.get('p').properties
          console.log(`  - ${pattern.pattern_name}`)
          console.log(`    Frequency: ${pattern.frequency}`)
          console.log(`    Last updated: ${pattern.last_updated}`)
          console.log(`    Batch ID: ${pattern.batch_id || 'none'}`)
          
          let meta = {}
          try {
            if (pattern.metadata) meta = JSON.parse(pattern.metadata)
          } catch (e) {}
          console.log(`    Detection: ${meta.detectionMethod || 'unknown'}`)
        })
      }
    }
    
    // Check if there are duplicate patterns with different batch IDs
    console.log('\n\nChecking for pattern duplicates...')
    const dupResult = await session.run(`
      MATCH (p:PatternSummary)
      WITH p.pattern_type as type, p.pattern_name as name, p.scope_id as scopeId, p.scope_data as scopeData, 
           collect(p) as patterns, count(p) as count
      WHERE count > 1
      RETURN type, name, scopeId, scopeData, count
      ORDER BY count DESC
    `)
    
    if (dupResult.records.length > 0) {
      console.log(`Found ${dupResult.records.length} duplicate pattern groups`)
      dupResult.records.forEach(record => {
        console.log(`\n  ${record.get('type')}/${record.get('name')}`)
        console.log(`  Scope: ${record.get('scopeId')}`)
        console.log(`  Data: ${record.get('scopeData')}`)
        console.log(`  Count: ${record.get('count').low || record.get('count')}`)
      })
    } else {
      console.log('No duplicate patterns found')
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

checkPatternMergeIssue().catch(console.error)