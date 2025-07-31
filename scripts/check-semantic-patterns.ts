#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
)

async function checkPatterns() {
  const session = driver.session()
  
  try {
    console.log('=== Checking for Semantic Patterns ===\n')
    
    // Check all patterns
    const allPatternsResult = await session.run(`
      MATCH (p:PatternSummary)
      RETURN p.pattern_name as name, 
             p.metadata as metadata,
             count(p) as count
      ORDER BY count DESC
    `)
    
    console.log('All pattern types:')
    allPatternsResult.records.forEach(record => {
      const name = record.get('name')
      const count = record.get('count').low || record.get('count')
      const metadata = record.get('metadata')
      console.log(`  ${name}: ${count} patterns`)
      if (metadata) {
        const parsed = JSON.parse(metadata)
        if (parsed.detectionMethod) {
          console.log(`    Detection method: ${parsed.detectionMethod}`)
        }
      }
    })
    
    // Check specifically for semantic patterns
    const semanticResult = await session.run(`
      MATCH (p:PatternSummary)
      WHERE p.metadata CONTAINS '"detectionMethod":"semantic"'
      RETURN p
      LIMIT 10
    `)
    
    console.log(`\nFound ${semanticResult.records.length} semantic patterns`)
    
    if (semanticResult.records.length > 0) {
      console.log('\nSemantic Pattern Details:')
      semanticResult.records.forEach((record, idx) => {
        const pattern = record.get('p').properties
        console.log(`\n${idx + 1}. Pattern:`)
        console.log(`   Type: ${pattern.pattern_type}`)
        console.log(`   Name: ${pattern.pattern_name}`)
        console.log(`   Confidence: ${pattern.confidence}`)
        console.log(`   Frequency: ${pattern.frequency}`)
        console.log(`   Metadata: ${pattern.metadata}`)
      })
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

checkPatterns().catch(console.error)