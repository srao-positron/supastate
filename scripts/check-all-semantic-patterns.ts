#!/usr/bin/env npx tsx

/**
 * Check all semantic patterns
 */

import * as dotenv from 'dotenv'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
)

async function checkAllSemanticPatterns() {
  const session = driver.session()
  
  try {
    console.log('=== All Semantic Patterns ===\n')
    
    const result = await session.run(`
      MATCH (p:PatternSummary)
      WHERE p.metadata CONTAINS 'semantic' 
        OR p.pattern_name = 'debugging-session-semantic'
      RETURN p
      ORDER BY p.frequency DESC
    `)
    
    console.log(`Found ${result.records.length} semantic patterns:\n`)
    
    const byProject = new Map<string, number>()
    
    result.records.forEach((record, idx) => {
      const pattern = record.get('p').properties
      
      let project = 'unknown'
      let period = 'unknown'
      if (pattern.scope_data) {
        try {
          const scope = JSON.parse(pattern.scope_data)
          project = scope.project || 'unknown'
          period = scope.period || 'unknown'
        } catch (e) {}
      }
      
      // Count by project
      byProject.set(project, (byProject.get(project) || 0) + 1)
      
      console.log(`${idx + 1}. ${pattern.pattern_type}/${pattern.pattern_name}`)
      console.log(`   Project: ${project}`)
      console.log(`   Period: ${period}`)
      console.log(`   Frequency: ${pattern.frequency} entities`)
      console.log(`   Confidence: ${pattern.confidence}`)
      console.log(`   Created: ${pattern.first_detected || pattern.created_at}`)
      
      if (pattern.metadata) {
        try {
          const meta = JSON.parse(pattern.metadata)
          console.log(`   Avg Similarity: ${meta.avgSimilarity || 'N/A'}`)
          console.log(`   Test pattern: ${meta.test ? 'Yes' : 'No'}`)
        } catch (e) {}
      }
      console.log()
    })
    
    console.log('\nSummary by project:')
    Array.from(byProject.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([project, count]) => {
        console.log(`  ${project}: ${count} patterns`)
      })
    
  } finally {
    await session.close()
    await driver.close()
  }
}

checkAllSemanticPatterns().catch(console.error)