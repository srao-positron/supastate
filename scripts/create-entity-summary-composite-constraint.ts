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
    console.log('=== Creating EntitySummary Composite Constraint ===\n')
    
    // Try to create the composite constraint
    try {
      await session.run(`
        CREATE CONSTRAINT entity_summary_entity_id_type_unique 
        FOR (s:EntitySummary) 
        REQUIRE (s.entity_id, s.entity_type) IS UNIQUE
      `)
      console.log('✅ Created composite unique constraint on EntitySummary(entity_id, entity_type)')
    } catch (error) {
      console.error('Error:', error.message)
      
      // Check if it's because of existing duplicates
      const duplicates = await session.run(`
        MATCH (s:EntitySummary)
        WITH s.entity_id as entityId, s.entity_type as entityType, collect(s) as summaries
        WHERE size(summaries) > 1
        RETURN entityId, entityType, size(summaries) as count
        LIMIT 5
      `)
      
      if (duplicates.records.length > 0) {
        console.log('\n❌ Cannot create constraint due to existing duplicates:')
        for (const record of duplicates.records) {
          console.log(`  - ${record.get('entityId')} (${record.get('entityType')}): ${record.get('count')} duplicates`)
        }
        console.log('\nRun the cleanup script first to remove duplicates.')
      }
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

main().catch(console.error)