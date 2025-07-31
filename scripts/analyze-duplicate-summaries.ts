#!/usr/bin/env npx tsx

/**
 * Analyze duplicate EntitySummary nodes to understand creation timing
 */

import * as dotenv from 'dotenv'
import neo4j from 'neo4j-driver'
import type { Session } from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

const NEO4J_URI = process.env.NEO4J_URI!
const NEO4J_USERNAME = process.env.NEO4J_USER!
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD!

const driver = neo4j.driver(
  NEO4J_URI,
  neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD)
)

async function analyzeDuplicateSummaries() {
  let session: Session | null = null
  
  try {
    console.log('=== Analyzing Duplicate EntitySummary Nodes ===\n')
    
    session = driver.session()
    
    // Find all duplicate EntitySummary nodes with timing information
    const duplicatesQuery = `
      MATCH (e:EntitySummary)
      WITH e.entityId AS entityId, e.entityType AS entityType, 
           COLLECT(e) AS summaries, COUNT(e) AS count
      WHERE count > 1
      RETURN entityId, entityType, count,
             [s IN summaries | {
               id: ID(s),
               createdAt: s.createdAt,
               lastUpdated: s.lastUpdated,
               workspace: s.workspace_id,
               user: s.user_id,
               batchId: s.batch_id,
               summary: SUBSTRING(s.summary, 0, 50) + '...'
             }] AS summaryDetails
      ORDER BY count DESC
      LIMIT 10
    `
    
    const duplicatesResult = await session.run(duplicatesQuery)
    
    if (duplicatesResult.records.length === 0) {
      console.log('No duplicate EntitySummary nodes found!')
      return
    }
    
    console.log(`Found ${duplicatesResult.records.length} entities with duplicate summaries:\n`)
    
    // Analyze timing patterns
    const timingPatterns: any[] = []
    
    duplicatesResult.records.forEach((record, idx) => {
      const entityId = record.get('entityId')
      const entityType = record.get('entityType')
      const count = record.get('count').toNumber()
      const summaryDetails = record.get('summaryDetails')
      
      console.log(`${idx + 1}. Entity: ${entityId} (${entityType})`)
      console.log(`   Duplicates: ${count}`)
      
      // Sort by creation time to see pattern
      const sorted = summaryDetails.sort((a: any, b: any) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return aTime - bTime
      })
      
      // Calculate time differences
      const timeDiffs: number[] = []
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].createdAt && sorted[i-1].createdAt) {
          const diff = new Date(sorted[i].createdAt).getTime() - new Date(sorted[i-1].createdAt).getTime()
          timeDiffs.push(diff)
        }
      }
      
      console.log('   Creation times:')
      sorted.forEach((s: any, i: number) => {
        const timeDiff = i > 0 && timeDiffs[i-1] ? ` (+${(timeDiffs[i-1] / 1000).toFixed(2)}s)` : ''
        console.log(`     - ${s.createdAt || 'no timestamp'}${timeDiff}`)
        console.log(`       Workspace: ${s.workspace || 'none'}, Batch: ${s.batchId || 'none'}`)
      })
      
      // Check if created within seconds of each other
      const rapidCreation = timeDiffs.some(diff => diff < 5000) // Within 5 seconds
      if (rapidCreation) {
        console.log('   ⚠️  Rapid creation detected - likely concurrent processing')
        timingPatterns.push({
          entityId,
          entityType,
          pattern: 'rapid',
          minInterval: Math.min(...timeDiffs) / 1000
        })
      }
      
      console.log('')
    })
    
    // Check for batch patterns
    console.log('=== Checking Batch Patterns ===\n')
    
    const batchQuery = `
      MATCH (e:EntitySummary)
      WHERE e.batch_id IS NOT NULL
      WITH e.batch_id AS batchId, COUNT(DISTINCT e.entityId) AS uniqueEntities,
           COUNT(e) AS totalNodes, 
           COLLECT(DISTINCT e.workspace_id) AS workspaces
      WHERE totalNodes > uniqueEntities
      RETURN batchId, uniqueEntities, totalNodes, 
             totalNodes - uniqueEntities AS duplicates,
             workspaces
      ORDER BY duplicates DESC
      LIMIT 10
    `
    
    const batchResult = await session.run(batchQuery)
    
    if (batchResult.records.length > 0) {
      console.log('Batches that created duplicates:\n')
      batchResult.records.forEach(record => {
        const batchId = record.get('batchId')
        const uniqueEntities = record.get('uniqueEntities').toNumber()
        const totalNodes = record.get('totalNodes').toNumber()
        const duplicates = record.get('duplicates').toNumber()
        const workspaces = record.get('workspaces')
        
        console.log(`Batch: ${batchId}`)
        console.log(`  Unique entities: ${uniqueEntities}`)
        console.log(`  Total nodes: ${totalNodes}`)
        console.log(`  Duplicates: ${duplicates}`)
        console.log(`  Workspaces: ${workspaces.join(', ') || 'none'}`)
        console.log('')
      })
    }
    
    // Check for cross-workspace duplicates
    console.log('=== Checking Cross-Workspace Duplicates ===\n')
    
    const crossWorkspaceQuery = `
      MATCH (e1:EntitySummary), (e2:EntitySummary)
      WHERE e1.entityId = e2.entityId 
        AND e1.entityType = e2.entityType
        AND ID(e1) < ID(e2)
        AND e1.workspace_id <> e2.workspace_id
      RETURN e1.entityId AS entityId, 
             e1.workspace_id AS workspace1,
             e2.workspace_id AS workspace2,
             e1.createdAt AS created1,
             e2.createdAt AS created2
      LIMIT 10
    `
    
    const crossResult = await session.run(crossWorkspaceQuery)
    
    if (crossResult.records.length > 0) {
      console.log('⚠️  Found cross-workspace duplicates (CRITICAL ISSUE):\n')
      crossResult.records.forEach(record => {
        console.log(`Entity: ${record.get('entityId')}`)
        console.log(`  Workspace 1: ${record.get('workspace1')} (${record.get('created1')})`)
        console.log(`  Workspace 2: ${record.get('workspace2')} (${record.get('created2')})`)
        console.log('')
      })
    } else {
      console.log('✅ No cross-workspace duplicates found\n')
    }
    
    // Summary
    if (timingPatterns.length > 0) {
      console.log('=== Summary ===\n')
      console.log(`Found ${timingPatterns.length} entities with rapid duplicate creation`)
      const avgInterval = timingPatterns.reduce((sum, p) => sum + p.minInterval, 0) / timingPatterns.length
      console.log(`Average minimum interval: ${avgInterval.toFixed(2)}s`)
      console.log('\nThis suggests concurrent pattern detection runs are creating duplicates.')
    }
    
  } catch (error) {
    console.error('Error analyzing duplicates:', error)
  } finally {
    if (session) {
      await session.close()
    }
  }
}

// Run the analysis
analyzeDuplicateSummaries()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })