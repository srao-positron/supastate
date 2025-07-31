#!/usr/bin/env npx tsx

/**
 * Analyze debugging patterns to see if they make sense
 */

import * as dotenv from 'dotenv'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

async function analyzeDebuggingPatterns() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
  )
  
  try {
    const session = driver.session()
    
    console.log('\n=== Analyzing Debugging Patterns ===')
    
    // Get debugging summaries with their content
    const debugSummaries = await session.run(`
      MATCH (e:EntitySummary)
      WHERE e.pattern_signals CONTAINS '"is_debugging":true'
      WITH e.project_name as project, 
           date(e.created_at) as day,
           count(e) as count
      RETURN project, day, count
      ORDER BY count DESC
      LIMIT 10
    `)
    
    console.log('\nDebugging activity by project and day:')
    debugSummaries.records.forEach(record => {
      console.log(`  ${record.get('project')} on ${record.get('day')}: ${record.get('count')} debugging events`)
    })
    
    // Sample some actual debugging memories
    const debugMemories = await session.run(`
      MATCH (e:EntitySummary)-[:SUMMARIZES]->(m:Memory)
      WHERE e.pattern_signals CONTAINS '"is_debugging":true'
        AND e.project_name = 'maxwell-edison'
      RETURN m.content as content, 
             e.keyword_frequencies as keywords,
             m.occurred_at as occurred_at
      ORDER BY m.occurred_at DESC
      LIMIT 10
    `)
    
    console.log('\n\nSample debugging memories from maxwell-edison:')
    debugMemories.records.forEach((record, idx) => {
      const content = record.get('content')
      const keywords = record.get('keywords')
      const occurred = record.get('occurred_at')
      
      console.log(`\n${idx + 1}. [${occurred}]`)
      console.log(`   Keywords: ${keywords}`)
      console.log(`   Content preview: ${content?.substring(0, 200)}...`)
    })
    
    // Check what keywords are triggering debugging classification
    const keywordAnalysis = await session.run(`
      MATCH (e:EntitySummary)
      WHERE e.pattern_signals CONTAINS '"is_debugging":true'
      RETURN e.keyword_frequencies as keywords
      LIMIT 50
    `)
    
    // Parse and aggregate keywords
    const keywordCounts: Record<string, number> = {}
    keywordAnalysis.records.forEach(record => {
      const keywordsJson = record.get('keywords')
      try {
        const keywords = JSON.parse(keywordsJson || '{}')
        Object.entries(keywords).forEach(([word, count]) => {
          keywordCounts[word] = (keywordCounts[word] || 0) + (count as number)
        })
      } catch (e) {
        // Skip invalid JSON
      }
    })
    
    console.log('\n\nTop debugging-related keywords found:')
    Object.entries(keywordCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .forEach(([word, count]) => {
        console.log(`  ${word}: ${count} occurrences`)
      })
    
    // Check false positives - memories marked as debugging but might not be
    const potentialFalsePositives = await session.run(`
      MATCH (e:EntitySummary)-[:SUMMARIZES]->(m:Memory)
      WHERE e.pattern_signals CONTAINS '"is_debugging":true'
        AND NOT (m.content =~ '(?i).*(error|bug|fix|debug|issue|problem|broken|fail|crash).*')
      RETURN m.content as content, e.keyword_frequencies as keywords
      LIMIT 5
    `)
    
    if (potentialFalsePositives.records.length > 0) {
      console.log('\n\nPotential false positives (marked as debugging but no obvious keywords):')
      potentialFalsePositives.records.forEach((record, idx) => {
        console.log(`\n${idx + 1}. Keywords: ${record.get('keywords')}`)
        console.log(`   Content: ${record.get('content')?.substring(0, 300)}...`)
      })
    }
    
    // Analyze time patterns
    const timePatterns = await session.run(`
      MATCH (e:EntitySummary)
      WHERE e.pattern_signals CONTAINS '"is_debugging":true'
      WITH hour(e.created_at) as hour, count(e) as count
      RETURN hour, count
      ORDER BY hour
    `)
    
    console.log('\n\nDebugging activity by hour of day:')
    timePatterns.records.forEach(record => {
      const hour = record.get('hour')
      const count = record.get('count')
      const bar = '█'.repeat(Math.min(count / 10, 50))
      console.log(`  ${String(hour).padStart(2, '0')}:00 ${bar} (${count})`)
    })
    
    await session.close()
  } finally {
    await driver.close()
  }
}

analyzeDebuggingPatterns().catch(console.error)