#!/usr/bin/env npx tsx

/**
 * Check what patterns have been discovered in Neo4j
 */

import * as dotenv from 'dotenv'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

async function checkPatterns() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
  )
  
  try {
    const session = driver.session()
    
    console.log('\n=== Pattern Detection Status ===')
    
    // Count EntitySummary nodes
    const summaryCount = await session.run(`
      MATCH (s:EntitySummary)
      RETURN 
        s.entity_type as type,
        count(s) as count
      ORDER BY count DESC
    `)
    
    console.log('\nEntitySummary nodes by type:')
    summaryCount.records.forEach(record => {
      console.log(`  ${record.get('type')}: ${record.get('count')}`)
    })
    
    // Count PatternSummary nodes
    const patternCount = await session.run(`
      MATCH (p:PatternSummary)
      RETURN count(p) as count
    `)
    console.log(`\nPatternSummary nodes: ${patternCount.records[0].get('count')}`)
    
    // Get all patterns
    const patterns = await session.run(`
      MATCH (p:PatternSummary)
      RETURN p
      ORDER BY p.created_at DESC
      LIMIT 20
    `)
    
    if (patterns.records.length > 0) {
      console.log('\nDiscovered patterns:')
      patterns.records.forEach((record, idx) => {
        const pattern = record.get('p').properties
        console.log(`\n${idx + 1}. ${pattern.pattern_type} - ${pattern.pattern_name}`)
        console.log(`   ID: ${pattern.id}`)
        console.log(`   Confidence: ${pattern.confidence}`)
        console.log(`   Frequency: ${pattern.frequency}`)
        console.log(`   Scope: ${pattern.scope_id}`)
        console.log(`   Created: ${pattern.first_detected}`)
        if (pattern.metadata) {
          try {
            const meta = JSON.parse(pattern.metadata)
            console.log(`   Metadata:`, meta)
          } catch (e) {
            console.log(`   Metadata: ${pattern.metadata}`)
          }
        }
      })
    } else {
      console.log('\nNo patterns discovered yet!')
    }
    
    // Check for debugging patterns specifically
    const debugPatterns = await session.run(`
      MATCH (e:EntitySummary)
      WHERE e.pattern_signals CONTAINS '"is_debugging":true'
      WITH e.user_id as userId,
           e.workspace_id as workspaceId,
           e.project_name as project,
           date(e.created_at) as day,
           count(e) as debugCount
      WHERE debugCount > 3
      RETURN userId, workspaceId, project, day, debugCount
      ORDER BY debugCount DESC
      LIMIT 10
    `)
    
    if (debugPatterns.records.length > 0) {
      console.log('\n\nPotential debugging patterns found:')
      debugPatterns.records.forEach(record => {
        console.log(`  User: ${record.get('userId') || 'N/A'}`)
        console.log(`  Workspace: ${record.get('workspaceId') || 'N/A'}`)
        console.log(`  Project: ${record.get('project')}`)
        console.log(`  Day: ${record.get('day')}`)
        console.log(`  Debug count: ${record.get('debugCount')}`)
        console.log('  ---')
      })
    }
    
    // Sample an EntitySummary to see its structure
    const sampleSummary = await session.run(`
      MATCH (s:EntitySummary)
      WHERE s.pattern_signals IS NOT NULL
      RETURN s
      LIMIT 1
    `)
    
    if (sampleSummary.records.length > 0) {
      const summary = sampleSummary.records[0].get('s').properties
      console.log('\n\nSample EntitySummary:')
      console.log('  ID:', summary.id)
      console.log('  Type:', summary.entity_type)
      console.log('  Pattern signals:', summary.pattern_signals)
      console.log('  Keywords:', summary.keyword_frequencies)
    }
    
    await session.close()
  } finally {
    await driver.close()
  }
}

checkPatterns().catch(console.error)