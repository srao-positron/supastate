#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
)

async function checkMemorySummaries() {
  const session = driver.session()
  
  try {
    console.log('=== Memory Summary Status ===\n')
    
    // Count memories without summaries
    const withoutSummariesResult = await session.run(`
      MATCH (m:Memory)
      WHERE m.content IS NOT NULL 
        AND m.embedding IS NOT NULL
        AND NOT EXISTS((m)<-[:SUMMARIZES]-(:EntitySummary))
      RETURN count(m) as count
    `)
    
    const withoutCount = withoutSummariesResult.records[0].get('count').low || 0
    console.log(`Memories without summaries: ${withoutCount}`)
    
    // Count memories with summaries
    const withSummariesResult = await session.run(`
      MATCH (m:Memory)<-[:SUMMARIZES]-(s:EntitySummary)
      RETURN count(distinct m) as count
    `)
    
    const withCount = withSummariesResult.records[0].get('count').low || 0
    console.log(`Memories with summaries: ${withCount}`)
    
    // Check total memories
    const totalResult = await session.run(`
      MATCH (m:Memory)
      WHERE m.content IS NOT NULL AND m.embedding IS NOT NULL
      RETURN count(m) as count
    `)
    
    const totalCount = totalResult.records[0].get('count').low || 0
    console.log(`Total memories with content and embeddings: ${totalCount}`)
    
    if (withoutCount === 0) {
      console.log('\nAll memories have summaries! Pattern processor will skip to pattern detection.')
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

checkMemorySummaries().catch(console.error)