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
    console.log('=== Force Cleaning Up Duplicate EntitySummary Nodes ===\n')
    
    // 1. Delete duplicates one by one
    console.log('1. Deleting duplicates individually...')
    
    // Get all entities with duplicates
    const duplicatesResult = await session.run(`
      MATCH (s:EntitySummary)
      WITH s.entity_id as entityId, s.entity_type as entityType, collect(s) as summaries
      WHERE size(summaries) > 1
      RETURN entityId, entityType, summaries
    `)
    
    let totalDeleted = 0
    
    for (const record of duplicatesResult.records) {
      const entityId = record.get('entityId')
      const entityType = record.get('entityType')
      const summaries = record.get('summaries')
      
      // Sort by updated_at to keep the most recent
      summaries.sort((a, b) => {
        const aTime = a.properties.updated_at || a.properties.created_at || '0'
        const bTime = b.properties.updated_at || b.properties.created_at || '0'
        return bTime.localeCompare(aTime) // Descending order
      })
      
      // Delete all but the first (most recent)
      for (let i = 1; i < summaries.length; i++) {
        const summary = summaries[i]
        await session.run(`
          MATCH (s:EntitySummary {id: $id})
          DETACH DELETE s
        `, { id: summary.properties.id })
        totalDeleted++
      }
      
      if (totalDeleted % 100 === 0) {
        console.log(`  Deleted ${totalDeleted} duplicates so far...`)
      }
    }
    
    console.log(`\nTotal duplicates deleted: ${totalDeleted}`)
    
    // 2. Verify cleanup
    console.log('\n2. Verifying cleanup...')
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
    
    // 3. Check final counts
    console.log('\n3. Final summary counts:')
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