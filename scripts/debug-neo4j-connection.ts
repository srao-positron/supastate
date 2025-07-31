/**
 * Debug Neo4j connection and data
 */

import * as dotenv from 'dotenv'
import neo4j from 'neo4j-driver'

// Load environment variables
dotenv.config({ path: '.env.local' })

async function debugNeo4j() {
  console.log('\n=== Debugging Neo4j Connection ===')
  
  const NEO4J_URI = process.env.NEO4J_URI || 'neo4j+s://eb61aceb.databases.neo4j.io'
  const NEO4J_USER = process.env.NEO4J_USER || 'neo4j'
  const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD
  
  console.log('URI:', NEO4J_URI)
  console.log('User:', NEO4J_USER)
  console.log('Has Password:', !!NEO4J_PASSWORD)
  
  if (!NEO4J_PASSWORD) {
    console.error('No password found!')
    return
  }
  
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
  )
  
  try {
    // Test connection
    await driver.verifyConnectivity()
    console.log('✓ Connected to Neo4j')
    
    const session = driver.session()
    
    // Simple count query
    console.log('\n=== Running Simple Queries ===')
    
    // Count all nodes
    const allNodesResult = await session.run('MATCH (n) RETURN count(n) as count')
    console.log(`Total nodes: ${allNodesResult.records[0].get('count')}`)
    
    // Count by label
    const labelResult = await session.run(`
      MATCH (n)
      RETURN labels(n)[0] as label, count(n) as count
      ORDER BY count DESC
      LIMIT 10
    `)
    
    console.log('\nNodes by label:')
    labelResult.records.forEach(record => {
      console.log(`  ${record.get('label')}: ${record.get('count')}`)
    })
    
    // Check Memory nodes specifically
    const memoryResult = await session.run('MATCH (m:Memory) RETURN count(m) as count')
    const memoryCount = memoryResult.records[0].get('count')
    console.log(`\nMemory nodes: ${memoryCount}`)
    
    // Check CodeEntity nodes
    const codeResult = await session.run('MATCH (c:CodeEntity) RETURN count(c) as count')
    const codeCount = codeResult.records[0].get('count')
    console.log(`CodeEntity nodes: ${codeCount}`)
    
    // Sample a memory
    if (memoryCount.toNumber() > 0) {
      const sampleMemory = await session.run('MATCH (m:Memory) RETURN m LIMIT 1')
      if (sampleMemory.records.length > 0) {
        const memory = sampleMemory.records[0].get('m').properties
        console.log('\nSample Memory:')
        console.log('  ID:', memory.id)
        console.log('  Has content:', !!memory.content)
        console.log('  Has embedding:', !!memory.embedding)
        console.log('  Workspace ID:', memory.workspace_id)
      }
    }
    
    // Sample a code entity
    if (codeCount.toNumber() > 0) {
      const sampleCode = await session.run('MATCH (c:CodeEntity) RETURN c LIMIT 1')
      if (sampleCode.records.length > 0) {
        const code = sampleCode.records[0].get('c').properties
        console.log('\nSample CodeEntity:')
        console.log('  ID:', code.id)
        console.log('  Name:', code.name)
        console.log('  Type:', code.type)
        console.log('  Has content:', !!code.content)
        console.log('  Has embedding:', !!code.embedding)
      }
    }
    
    await session.close()
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await driver.close()
  }
}

debugNeo4j().catch(console.error)