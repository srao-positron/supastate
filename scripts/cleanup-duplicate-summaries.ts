#!/usr/bin/env npx tsx
import neo4j from 'neo4j-driver'

const NEO4J_URI = 'neo4j+s://eb61aceb.databases.neo4j.io'
const NEO4J_USER = 'neo4j'
const NEO4J_PASSWORD = 'XROfdG-0_Idz6zzm6s1C5Bwao6GgW_84T7BeT_uvtW8'

async function main() {
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
  )
  
  const session = driver.session()
  
  try {
    console.log('=== Cleaning Up Duplicate EntitySummary Nodes ===\n')
    
    // 1. Find all duplicates
    console.log('1. Finding duplicate EntitySummary nodes...')
    const duplicatesResult = await session.run(`
      MATCH (s:EntitySummary)
      WITH s.entity_id as entityId, s.entity_type as entityType, count(*) as copies, collect(s) as summaries
      WHERE copies > 1
      RETURN entityId, entityType, copies, summaries
      ORDER BY copies DESC
    `)
    
    console.log(`Found ${duplicatesResult.records.length} entities with duplicates\n`)
    
    let totalDuplicates = 0
    for (const record of duplicatesResult.records) {
      const entityId = record.get('entityId')
      const entityType = record.get('entityType')
      const copies = record.get('copies').toNumber()
      totalDuplicates += (copies - 1)
      
      console.log(`  ${entityType} ${entityId}: ${copies} copies`)
    }
    
    console.log(`\nTotal duplicate nodes to remove: ${totalDuplicates}`)
    
    // 2. Clean up duplicates - keep the most recent one
    console.log('\n2. Removing duplicate nodes (keeping most recent)...')
    
    const cleanupResult = await session.run(`
      MATCH (s:EntitySummary)
      WITH s.entity_id as entityId, s.entity_type as entityType, collect(s) as summaries
      WHERE size(summaries) > 1
      // Sort by updated_at desc, keep the first (most recent)
      WITH entityId, entityType, summaries, 
           head(apoc.coll.sortNodes(summaries, 'updated_at')) as keeper,
           tail(apoc.coll.sortNodes(summaries, 'updated_at')) as duplicates
      UNWIND duplicates as dup
      DETACH DELETE dup
      RETURN count(dup) as deleted
    `)
    
    // Since we don't have APOC, let's use a different approach
    const cleanupResult2 = await session.run(`
      MATCH (s:EntitySummary)
      WITH s.entity_id as entityId, s.entity_type as entityType, collect(s) as summaries
      WHERE size(summaries) > 1
      // Keep the one with the highest updated_at
      WITH entityId, entityType, summaries
      UNWIND summaries as s
      WITH entityId, entityType, s
      ORDER BY s.updated_at DESC
      WITH entityId, entityType, collect(s) as orderedSummaries
      // Delete all but the first
      FOREACH (i IN range(1, size(orderedSummaries)-1) |
        DETACH DELETE orderedSummaries[i]
      )
      RETURN entityId, entityType, size(orderedSummaries)-1 as deletedCount
    `)
    
    let totalDeleted = 0
    for (const record of cleanupResult2.records) {
      totalDeleted += record.get('deletedCount').toNumber()
    }
    
    console.log(`Deleted ${totalDeleted} duplicate nodes`)
    
    // 3. Create unique constraint
    console.log('\n3. Creating unique constraint on EntitySummary...')
    try {
      await session.run(`
        CREATE CONSTRAINT entity_summary_unique IF NOT EXISTS
        FOR (s:EntitySummary) 
        REQUIRE (s.entity_id, s.entity_type) IS UNIQUE
      `)
      console.log('Unique constraint created successfully')
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('Unique constraint already exists')
      } else {
        console.error('Error creating constraint:', error.message)
      }
    }
    
    // 4. Verify no duplicates remain
    console.log('\n4. Verifying cleanup...')
    const verifyResult = await session.run(`
      MATCH (s:EntitySummary)
      WITH s.entity_id as entityId, s.entity_type as entityType, count(*) as copies
      WHERE copies > 1
      RETURN count(*) as remainingDuplicates
    `)
    
    const remaining = verifyResult.records[0].get('remainingDuplicates').toNumber()
    if (remaining === 0) {
      console.log('✅ All duplicates have been removed')
    } else {
      console.log(`❌ ${remaining} entities still have duplicates`)
    }
    
    // 5. Check summary counts
    console.log('\n5. Final summary counts:')
    const countResult = await session.run(`
      MATCH (s:EntitySummary)
      RETURN s.entity_type as type, count(*) as count
      ORDER BY type
    `)
    
    for (const record of countResult.records) {
      console.log(`  ${record.get('type')}: ${record.get('count').toNumber()}`)
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

main().catch(console.error)