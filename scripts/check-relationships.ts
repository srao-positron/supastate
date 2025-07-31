import neo4j from 'neo4j-driver'
import { config } from 'dotenv'

config({ path: '.env.local' })

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
)

async function checkRelationships() {
  const session = driver.session()
  try {
    // Check relationship types and counts
    const result = await session.run(`
      MATCH ()-[r]->()
      RETURN type(r) as relationship, COUNT(r) as count
      ORDER BY count DESC
    `)
    
    console.log('Relationship types in Neo4j:')
    let total = 0
    result.records.forEach(record => {
      const count = record.get('count').toNumber()
      console.log(`  ${record.get('relationship')}: ${count}`)
      total += count
    })
    console.log(`\nTotal relationships: ${total}`)
    
    // Check specific relationships for code entities
    console.log('\nCode-related relationships:')
    
    const codeRelationships = await session.run(`
      MATCH (c:CodeEntity)-[r]->(n)
      RETURN type(r) as relationship, labels(n)[0] as targetType, COUNT(r) as count
      ORDER BY count DESC
    `)
    
    codeRelationships.records.forEach(record => {
      console.log(`  CodeEntity -[${record.get('relationship')}]-> ${record.get('targetType')}: ${record.get('count').toNumber()}`)
    })
    
    // Check memory relationships
    console.log('\nMemory-related relationships:')
    
    const memoryRelationships = await session.run(`
      MATCH (m:Memory)-[r]->(n)
      RETURN type(r) as relationship, labels(n)[0] as targetType, COUNT(r) as count
      ORDER BY count DESC
    `)
    
    memoryRelationships.records.forEach(record => {
      console.log(`  Memory -[${record.get('relationship')}]-> ${record.get('targetType')}: ${record.get('count').toNumber()}`)
    })
    
  } finally {
    await session.close()
    await driver.close()
  }
}

checkRelationships()