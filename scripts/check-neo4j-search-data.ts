#!/usr/bin/env npx tsx

import neo4j from 'neo4j-driver'

async function checkNeo4jData() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI || 'neo4j://localhost:7687',
    neo4j.auth.basic(
      process.env.NEO4J_USERNAME || 'neo4j',
      process.env.NEO4J_PASSWORD || ''
    )
  )
  
  const session = driver.session()
  
  try {
    console.log('Checking Neo4j data for search...\n')
    
    // Count nodes by type
    const nodeTypes = ['Memory', 'CodeEntity', 'EntitySummary', 'Pattern']
    
    for (const nodeType of nodeTypes) {
      const result = await session.run(`
        MATCH (n:${nodeType})
        RETURN count(n) as count
      `)
      console.log(`${nodeType}: ${result.records[0].get('count')}`)
    }
    
    // Check EntitySummary with embeddings
    const embeddingResult = await session.run(`
      MATCH (s:EntitySummary)
      WHERE s.embedding IS NOT NULL
      RETURN count(s) as count
    `)
    console.log(`\nEntitySummary with embeddings: ${embeddingResult.records[0].get('count')}`)
    
    // Check Memory-Code relationships
    const relResult = await session.run(`
      MATCH ()-[r:REFERENCES_CODE|DISCUSSED_IN]-()
      RETURN type(r) as type, count(r) as count
    `)
    console.log('\nRelationships:')
    relResult.records.forEach(record => {
      console.log(`  ${record.get('type')}: ${record.get('count')}`)
    })
    
    // Sample memories
    const memoryResult = await session.run(`
      MATCH (m:Memory)
      WHERE m.content IS NOT NULL
      RETURN m.content as content, m.workspace_id as workspace
      LIMIT 3
    `)
    
    console.log('\nSample memories:')
    memoryResult.records.forEach((record, i) => {
      const content = record.get('content')
      const workspace = record.get('workspace')
      console.log(`\n${i + 1}. Workspace: ${workspace}`)
      console.log(`   ${content.substring(0, 150)}...`)
    })
    
    // Check workspace distribution
    const workspaceResult = await session.run(`
      MATCH (n)
      WHERE n.workspace_id IS NOT NULL
      RETURN DISTINCT n.workspace_id as workspace, count(n) as count
      ORDER BY count DESC
    `)
    
    console.log('\nWorkspace distribution:')
    workspaceResult.records.forEach(record => {
      console.log(`  ${record.get('workspace')}: ${record.get('count')} nodes`)
    })
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await session.close()
    await driver.close()
  }
}

checkNeo4jData().catch(console.error)