/**
 * Check workspace IDs in Neo4j
 */

import * as dotenv from 'dotenv'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

async function checkWorkspaceIds() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
  )
  
  try {
    const session = driver.session()
    
    // Check Memory workspace_ids
    const memoryWorkspaces = await session.run(`
      MATCH (m:Memory)
      RETURN 
        m.workspace_id as workspace_id,
        count(m) as count
      ORDER BY count DESC
      LIMIT 10
    `)
    
    console.log('\nMemory nodes by workspace_id:')
    memoryWorkspaces.records.forEach(record => {
      const wsId = record.get('workspace_id')
      console.log(`  ${wsId || 'NULL'}: ${record.get('count')}`)
    })
    
    // Check Code workspace_ids
    const codeWorkspaces = await session.run(`
      MATCH (c:CodeEntity)
      RETURN 
        c.workspace_id as workspace_id,
        count(c) as count
      ORDER BY count DESC
      LIMIT 10
    `)
    
    console.log('\nCodeEntity nodes by workspace_id:')
    codeWorkspaces.records.forEach(record => {
      const wsId = record.get('workspace_id')
      console.log(`  ${wsId || 'NULL'}: ${record.get('count')}`)
    })
    
    // Check user_ids
    const userIds = await session.run(`
      MATCH (m:Memory)
      WHERE m.user_id IS NOT NULL
      RETURN 
        m.user_id as user_id,
        count(m) as count
      ORDER BY count DESC
      LIMIT 5
    `)
    
    console.log('\nMemory nodes by user_id:')
    userIds.records.forEach(record => {
      console.log(`  ${record.get('user_id')}: ${record.get('count')}`)
    })
    
    // Check for summaries
    const summaryCheck = await session.run(`
      MATCH (s:EntitySummary)
      RETURN count(s) as count
    `)
    console.log(`\nEntitySummary nodes: ${summaryCheck.records[0].get('count')}`)
    
    await session.close()
  } finally {
    await driver.close()
  }
}

checkWorkspaceIds().catch(console.error)