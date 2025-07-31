#!/usr/bin/env npx tsx

/**
 * Safely clean up duplicate EntitySummary nodes
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

async function cleanupDuplicateSummaries() {
  let session: Session | null = null
  
  try {
    console.log('=== Cleaning Up Duplicate EntitySummary Nodes ===\n')
    
    session = driver.session()
    
    // 1. Find all duplicates
    console.log('1. Finding duplicate EntitySummary nodes...')
    const duplicatesResult = await session.run(`
      MATCH (s:EntitySummary)
      WHERE s.entity_id IS NOT NULL
      WITH s.entity_id as entityId, s.entity_type as entityType, 
           COUNT(*) as copies, COLLECT(s) as summaries
      WHERE copies > 1
      RETURN entityId, entityType, copies,
             [sum IN summaries | {
               id: sum.id,
               created: sum.created_at,
               updated: sum.updated_at,
               nodeId: ID(sum)
             }] as summaryInfo
      ORDER BY copies DESC
      LIMIT 20
    `)
    
    console.log(`Found ${duplicatesResult.records.length} entities with duplicates (showing top 20)\n`)
    
    let totalDuplicates = 0
    duplicatesResult.records.forEach(record => {
      const entityId = record.get('entityId')
      const entityType = record.get('entityType')
      const copies = record.get('copies').toNumber()
      totalDuplicates += (copies - 1)
      
      console.log(`  ${entityType} ${entityId}: ${copies} copies`)
    })
    
    // Get total count
    const totalCountResult = await session.run(`
      MATCH (s:EntitySummary)
      WHERE s.entity_id IS NOT NULL
      WITH s.entity_id as entityId, s.entity_type as entityType, COUNT(*) as copies
      WHERE copies > 1
      RETURN SUM(copies - 1) as totalExtra
    `)
    
    const totalExtra = totalCountResult.records[0].get('totalExtra').toNumber()
    console.log(`\nTotal duplicate nodes to remove: ${totalExtra}`)
    
    // 2. Confirm before deletion
    console.log('\n2. Preparing to remove duplicates...')
    console.log('Strategy: Keep the OLDEST summary (first created) for each entity')
    console.log('This preserves the original summary and its relationships\n')
    
    // Get user confirmation
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    })
    
    const answer = await new Promise<string>(resolve => {
      readline.question('Proceed with cleanup? (yes/no): ', resolve)
    })
    readline.close()
    
    if (answer.toLowerCase() !== 'yes') {
      console.log('Cleanup cancelled')
      return
    }
    
    // 3. Clean up duplicates - keep the oldest one
    console.log('\n3. Removing duplicate nodes (keeping oldest/first created)...')
    
    // Process in batches to avoid memory issues
    const batchSize = 100
    let totalDeleted = 0
    let hasMore = true
    
    while (hasMore) {
      const batchResult = await session.run(`
        MATCH (s:EntitySummary)
        WHERE s.entity_id IS NOT NULL
        WITH s.entity_id as entityId, s.entity_type as entityType, COLLECT(s) as summaries
        WHERE size(summaries) > 1
        WITH entityId, entityType, summaries
        LIMIT ${batchSize}
        UNWIND summaries as s
        WITH entityId, entityType, s
        ORDER BY entityId, entityType, s.created_at ASC
        WITH entityId, entityType, COLLECT(s) as orderedSummaries
        WITH entityId, entityType, orderedSummaries, 
             orderedSummaries[0] as keeper,
             tail(orderedSummaries) as toDelete
        UNWIND toDelete as dup
        DETACH DELETE dup
        RETURN COUNT(dup) as deleted
      `)
      
      const batchDeleted = batchResult.records.length > 0 
        ? batchResult.records[0].get('deleted').toNumber() 
        : 0
      
      totalDeleted += batchDeleted
      
      if (batchDeleted < batchSize) {
        hasMore = false
      }
      
      console.log(`  Deleted ${batchDeleted} duplicates (total: ${totalDeleted})`)
    }
    
    console.log(`\nTotal deleted: ${totalDeleted} duplicate nodes`)
    
    // 4. Verify no duplicates remain
    console.log('\n4. Verifying cleanup...')
    const verifyResult = await session.run(`
      MATCH (s:EntitySummary)
      WHERE s.entity_id IS NOT NULL
      WITH s.entity_id as entityId, s.entity_type as entityType, COUNT(*) as copies
      WHERE copies > 1
      RETURN COUNT(*) as remainingDuplicateGroups, SUM(copies - 1) as remainingDuplicateNodes
    `)
    
    const remaining = verifyResult.records[0].get('remainingDuplicateGroups').toNumber()
    const remainingNodes = verifyResult.records[0].get('remainingDuplicateNodes').toNumber()
    
    if (remaining === 0) {
      console.log('✅ All duplicates have been removed')
    } else {
      console.log(`❌ ${remaining} entities still have duplicates (${remainingNodes} extra nodes)`)
    }
    
    // 5. Check summary counts
    console.log('\n5. Final summary counts:')
    const countResult = await session.run(`
      MATCH (s:EntitySummary)
      RETURN s.entity_type as type, COUNT(*) as count
      ORDER BY type
    `)
    
    countResult.records.forEach(record => {
      console.log(`  ${record.get('type')}: ${record.get('count').toNumber()}`)
    })
    
    // 6. Check for orphaned summaries (no SUMMARIZES relationship)
    console.log('\n6. Checking for orphaned summaries...')
    const orphanResult = await session.run(`
      MATCH (s:EntitySummary)
      WHERE NOT EXISTS((s)-[:SUMMARIZES]->())
      RETURN COUNT(s) as orphaned
    `)
    
    const orphaned = orphanResult.records[0].get('orphaned').toNumber()
    if (orphaned > 0) {
      console.log(`⚠️  Found ${orphaned} orphaned EntitySummary nodes (no SUMMARIZES relationship)`)
    } else {
      console.log('✅ No orphaned summaries found')
    }
    
  } catch (error) {
    console.error('Error during cleanup:', error)
  } finally {
    if (session) {
      await session.close()
    }
    await driver.close()
  }
}

// Run the cleanup
cleanupDuplicateSummaries()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })