import { config } from 'dotenv'
config({ path: '.env.local' })

import { neo4jService } from '../src/lib/neo4j/service'
import { closeDriver } from '../src/lib/neo4j/client'

async function checkStatus() {
  await neo4jService.initialize()
  
  const result = await neo4jService.executeQuery(`
    MATCH (m:Memory)
    RETURN count(m) as memoryCount
  `)
  
  const projectResult = await neo4jService.executeQuery(`
    MATCH (p:Project)
    RETURN p.name as name, count{(p)<-[:BELONGS_TO]-(m:Memory)} as memories
  `)
  
  const relationshipResult = await neo4jService.executeQuery(`
    MATCH ()-[r]->()
    RETURN type(r) as type, count(r) as count
    ORDER BY count DESC
    LIMIT 10
  `)
  
  console.log('\n=== Neo4j Status ===')
  console.log('Total memories:', result.records[0].memoryCount)
  console.log('\nProjects:')
  projectResult.records.forEach((r: any) => {
    console.log(`  - ${r.name}: ${r.memories} memories`)
  })
  console.log('\nTop relationships:')
  relationshipResult.records.forEach((r: any) => {
    console.log(`  - ${r.type}: ${r.count}`)
  })
  
  await closeDriver()
}

checkStatus().catch(console.error)