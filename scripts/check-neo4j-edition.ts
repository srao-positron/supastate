#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
)

async function checkNeo4jEdition() {
  const session = driver.session()
  
  try {
    // Check database info
    const dbInfo = await session.run(`
      CALL dbms.components() YIELD name, versions, edition
      RETURN name, edition, versions[0] as version
    `)
    
    console.log('=== Neo4j Database Info ===\n')
    dbInfo.records.forEach(record => {
      console.log(`${record.get('name')}:`)
      console.log(`  Edition: ${record.get('edition')}`)
      console.log(`  Version: ${record.get('version')}`)
    })
    
    // Check if it's Aura
    const isAura = dbInfo.records.some(r => 
      r.get('edition')?.toLowerCase().includes('aura')
    )
    
    if (isAura) {
      console.log('\n⚠️  This is Neo4j Aura - GDS is NOT supported!')
      console.log('We need to use alternative similarity calculations.')
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

checkNeo4jEdition().catch(console.error)