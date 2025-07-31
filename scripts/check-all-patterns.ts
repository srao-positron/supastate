#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
)

async function checkAllPatterns() {
  const session = driver.session()
  
  try {
    const result = await session.run(`
      MATCH (p:PatternSummary)
      RETURN p
      ORDER BY p.last_updated DESC
      LIMIT 20
    `)
    
    console.log(`Found ${result.records.length} patterns (most recent):\n`)
    
    result.records.forEach((record, idx) => {
      const pattern = record.get('p').properties
      console.log(`${idx + 1}. ${pattern.pattern_type} - ${pattern.pattern_name}`)
      console.log(`   Created: ${pattern.first_detected || pattern.created_at}`)
      console.log(`   Updated: ${pattern.last_updated}`)
      console.log(`   Confidence: ${pattern.confidence}`)
      console.log(`   Frequency: ${pattern.frequency}`)
      console.log(`   Batch ID: ${pattern.batch_id}`)
      if (pattern.metadata) {
        try {
          const meta = JSON.parse(pattern.metadata)
          console.log(`   Detection Method: ${meta.detectionMethod || 'unknown'}`)
          if (meta.avgSimilarity) {
            console.log(`   Avg Similarity: ${meta.avgSimilarity}`)
          }
        } catch (e) {
          console.log(`   Metadata: ${pattern.metadata}`)
        }
      }
      console.log()
    })
    
  } finally {
    await session.close()
    await driver.close()
  }
}

checkAllPatterns().catch(console.error)