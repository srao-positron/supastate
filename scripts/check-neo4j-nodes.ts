import { config } from 'dotenv'
import neo4j from 'neo4j-driver'

// Load environment variables
config({ path: '.env.local' })

async function checkNeo4jNodes() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
  )

  try {
    const session = driver.session()
    
    console.log('Checking Neo4j node counts...\n')
    
    // Count Memory nodes
    const memoryResult = await session.run('MATCH (m:Memory) RETURN COUNT(m) as count')
    const memoryCount = memoryResult.records[0]?.get('count').toNumber() || 0
    console.log(`Memory nodes: ${memoryCount}`)
    
    // Count CodeEntity nodes
    const codeResult = await session.run('MATCH (c:CodeEntity) RETURN COUNT(c) as count')
    const codeCount = codeResult.records[0]?.get('count').toNumber() || 0
    console.log(`CodeEntity nodes: ${codeCount}`)
    
    // Count EntitySummary nodes
    const summaryResult = await session.run('MATCH (e:EntitySummary) RETURN COUNT(e) as count')
    const summaryCount = summaryResult.records[0]?.get('count').toNumber() || 0
    console.log(`EntitySummary nodes: ${summaryCount}`)
    
    // Count Pattern nodes
    const patternResult = await session.run('MATCH (p:Pattern) RETURN COUNT(p) as count')
    const patternCount = patternResult.records[0]?.get('count').toNumber() || 0
    console.log(`Pattern nodes: ${patternCount}`)
    
    // Check a few Memory nodes
    console.log('\nSample Memory nodes:')
    const sampleMemories = await session.run('MATCH (m:Memory) RETURN m.id, m.workspace_id, m.content, m.embedding IS NOT NULL as has_embedding LIMIT 5')
    sampleMemories.records.forEach(record => {
      console.log(`- ID: ${record.get('m.id')}, Workspace: ${record.get('m.workspace_id')}, Has Embedding: ${record.get('has_embedding')}, Content: ${record.get('m.content')?.substring(0, 50)}...`)
    })
    
    // Total node count
    const totalResult = await session.run('MATCH (n) RETURN COUNT(n) as count')
    const totalCount = totalResult.records[0]?.get('count').toNumber() || 0
    console.log(`\nTotal nodes in Neo4j: ${totalCount}`)
    
    await session.close()
  } catch (error) {
    console.error('Error checking Neo4j:', error)
  } finally {
    await driver.close()
  }
}

checkNeo4jNodes().catch(console.error)