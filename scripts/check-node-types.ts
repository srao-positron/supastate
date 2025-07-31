import neo4j from 'neo4j-driver'
import { config } from 'dotenv'

config({ path: '.env.local' })

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
)

async function checkNodes() {
  const session = driver.session()
  try {
    const result = await session.run('MATCH (n) RETURN labels(n)[0] as label, COUNT(n) as count ORDER BY count DESC')
    console.log('Node types in Neo4j:')
    result.records.forEach(record => {
      console.log(`  ${record.get('label')}: ${record.get('count').toNumber()}`)
    })
    
    const total = await session.run('MATCH (n) RETURN COUNT(n) as count')
    console.log(`\nTotal nodes: ${total.records[0].get('count').toNumber()}`)
  } finally {
    await session.close()
    await driver.close()
  }
}

checkNodes()