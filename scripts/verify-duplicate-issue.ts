#!/usr/bin/env npx tsx

/**
 * Verify the duplicate EntitySummary issue is due to property name mismatch
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

async function verifyDuplicateIssue() {
  let session: Session | null = null
  
  try {
    console.log('=== Verifying Duplicate EntitySummary Issue ===\n')
    
    session = driver.session()
    
    // Check for duplicates using the correct property name
    const duplicatesQuery = `
      MATCH (e:EntitySummary)
      WHERE e.entity_id IS NOT NULL
      WITH e.entity_id AS entityId, e.entity_type AS entityType, 
           COLLECT(e) AS summaries, COUNT(e) AS count
      WHERE count > 1
      RETURN entityId, entityType, count,
             [s IN summaries | {
               id: s.id,
               created: s.created_at,
               workspace: s.workspace_id,
               user: s.user_id
             }] AS details
      ORDER BY count DESC
      LIMIT 10
    `
    
    const duplicatesResult = await session.run(duplicatesQuery)
    
    console.log(`Found ${duplicatesResult.records.length} entities with duplicate summaries:\n`)
    
    duplicatesResult.records.forEach((record, idx) => {
      const entityId = record.get('entityId')
      const entityType = record.get('entityType')
      const count = record.get('count').toNumber()
      const details = record.get('details')
      
      console.log(`${idx + 1}. Entity: ${entityId} (${entityType})`)
      console.log(`   Duplicates: ${count}`)
      
      details.forEach((d: any, i: number) => {
        console.log(`   - Summary ${i + 1}: ${d.id}`)
        console.log(`     Created: ${d.created}`)
        console.log(`     Workspace: ${d.workspace}`)
      })
      
      console.log('')
    })
    
    // Check a specific entity with many duplicates
    if (duplicatesResult.records.length > 0) {
      const worstEntityId = duplicatesResult.records[0].get('entityId')
      
      console.log(`\n=== Detailed Analysis of Worst Case: ${worstEntityId} ===\n`)
      
      const detailQuery = `
        MATCH (s:EntitySummary {entity_id: $entityId})
        MATCH (s)-[:SUMMARIZES]->(e)
        RETURN s.id as summaryId,
               s.created_at as created,
               s.updated_at as updated,
               ID(s) as nodeId,
               labels(e) as entityLabels,
               e.id as actualEntityId
        ORDER BY s.created_at
      `
      
      const detailResult = await session.run(detailQuery, { entityId: worstEntityId })
      
      detailResult.records.forEach((record, idx) => {
        console.log(`${idx + 1}. Summary ID: ${record.get('summaryId')}`)
        console.log(`   Node ID: ${record.get('nodeId')}`)
        console.log(`   Created: ${record.get('created')}`)
        console.log(`   Points to: ${record.get('entityLabels')} (${record.get('actualEntityId')})`)
      })
    }
    
    // Summary statistics
    console.log('\n\n=== Summary Statistics ===\n')
    
    const statsQuery = `
      MATCH (s:EntitySummary)
      WITH s.entity_id as entityId, s.entity_type as entityType, COUNT(*) as count
      WHERE entityId IS NOT NULL
      WITH 
        COUNT(CASE WHEN count = 1 THEN 1 END) as unique,
        COUNT(CASE WHEN count > 1 THEN 1 END) as duplicated,
        SUM(CASE WHEN count > 1 THEN count - 1 ELSE 0 END) as extraCopies,
        MAX(count) as maxDuplicates
      RETURN unique, duplicated, extraCopies, maxDuplicates
    `
    
    const statsResult = await session.run(statsQuery)
    const stats = statsResult.records[0]
    
    console.log(`Unique entities with single summary: ${stats.get('unique').toNumber()}`)
    console.log(`Entities with duplicate summaries: ${stats.get('duplicated').toNumber()}`)
    console.log(`Total extra copies to remove: ${stats.get('extraCopies').toNumber()}`)
    console.log(`Maximum duplicates for one entity: ${stats.get('maxDuplicates').toNumber()}`)
    
  } catch (error) {
    console.error('Error verifying duplicates:', error)
  } finally {
    if (session) {
      await session.close()
    }
    await driver.close()
  }
}

// Run the verification
verifyDuplicateIssue()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })