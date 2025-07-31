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
    console.log('=== Testing Neo4j Return Format ===\n')
    
    // Test how EntitySummary nodes are returned
    const result = await session.run(`
      MATCH (m:EntitySummary {entity_type: 'memory'})
      WHERE m.embedding IS NOT NULL
        AND m.user_id = 'a02c3fed-3a24-442f-becc-97bac8b75e90'
      WITH m
      LIMIT 2
      RETURN collect(m) as memories
    `)
    
    const memories = result.records[0]?.get('memories')
    console.log('Type of memories:', typeof memories)
    console.log('Is array:', Array.isArray(memories))
    console.log('Length:', memories?.length)
    
    if (memories && memories.length > 0) {
      console.log('\nFirst memory structure:')
      const firstMemory = memories[0]
      console.log('Type:', typeof firstMemory)
      console.log('Constructor:', firstMemory?.constructor?.name)
      console.log('Keys:', Object.keys(firstMemory || {}))
      
      // Check if it's a Neo4j Node object
      if (firstMemory?.properties) {
        console.log('\nProperties:')
        console.log('  entity_id:', firstMemory.properties.entity_id)
        console.log('  project_name:', firstMemory.properties.project_name)
        console.log('  user_id:', firstMemory.properties.user_id)
        console.log('  embedding exists:', !!firstMemory.properties.embedding)
      } else {
        console.log('\nDirect properties:')
        console.log('  entity_id:', firstMemory?.entity_id)
        console.log('  project_name:', firstMemory?.project_name)
        console.log('  user_id:', firstMemory?.user_id)
        console.log('  embedding exists:', !!firstMemory?.embedding)
      }
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

main().catch(console.error)