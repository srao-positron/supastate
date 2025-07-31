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
    console.log('=== All Neo4j Constraints ===\n')
    
    // List all constraints
    const constraints = await session.run(`
      SHOW CONSTRAINTS
    `)
    
    console.log('Constraints in database:')
    for (const record of constraints.records) {
      const name = record.get('name')
      const type = record.get('type')
      const entityType = record.get('entityType')
      const labelsOrTypes = record.get('labelsOrTypes')
      const properties = record.get('properties')
      const ownedIndex = record.get('ownedIndex')
      
      console.log(`\n${name}:`)
      console.log(`  Type: ${type}`)
      console.log(`  Entity: ${entityType} - ${labelsOrTypes}`)
      console.log(`  Properties: ${properties}`)
      console.log(`  Owned Index: ${ownedIndex || 'none'}`)
    }
    
    // Check specifically for EntitySummary constraints
    console.log('\n=== EntitySummary Specific Constraints ===\n')
    
    const entitySummaryConstraints = constraints.records.filter(r => 
      r.get('labelsOrTypes')?.includes('EntitySummary')
    )
    
    if (entitySummaryConstraints.length === 0) {
      console.log('No constraints found on EntitySummary nodes')
    } else {
      for (const record of entitySummaryConstraints) {
        console.log(`- ${record.get('name')}: ${record.get('properties')}`)
      }
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

main().catch(console.error)