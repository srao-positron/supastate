#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { resolve } from 'path'
import neo4j from 'neo4j-driver'
import { getOwnershipFilter, getOwnershipParams } from '../src/lib/neo4j/query-patterns'

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') })

async function testOwnershipFilter() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI || 'neo4j://localhost:7687',
    neo4j.auth.basic(
      process.env.NEO4J_USERNAME || 'neo4j',
      process.env.NEO4J_PASSWORD || ''
    )
  )
  
  const session = driver.session()
  
  // Test with the user from the auth cookie
  const userId = 'a02c3fed-3a24-442f-becc-97bac8b75e90'
  
  try {
    console.log('Testing ownership filters...\n')
    
    // Test 1: Count all memories
    const allMemories = await session.run(`
      MATCH (m:Memory) 
      RETURN count(m) as count
    `)
    console.log(`Total memories in database: ${allMemories.records[0].get('count')}`)
    
    // Test 2: Count memories with user filter
    const context1 = {
      userId,
      workspaceId: `user:${userId}`,
      teamId: undefined
    }
    
    const userMemories = await session.run(`
      MATCH (m:Memory)
      WHERE ${getOwnershipFilter({ ...context1, nodeAlias: 'm' })}
      RETURN count(m) as count
    `, getOwnershipParams(context1))
    
    console.log(`\nWith personal workspace filter:`)
    console.log(`Filter: ${getOwnershipFilter({ ...context1, nodeAlias: 'm' })}`)
    console.log(`Params:`, getOwnershipParams(context1))
    console.log(`Count: ${userMemories.records[0].get('count')}`)
    
    // Test 3: Search for specific content
    const searchResult = await session.run(`
      MATCH (m:Memory)
      WHERE m.content =~ '(?i).*anthropic.*'
        AND ${getOwnershipFilter({ ...context1, nodeAlias: 'm' })}
      RETURN m.id as id, m.workspace_id as workspace_id, m.user_id as user_id
      LIMIT 5
    `, getOwnershipParams(context1))
    
    console.log(`\nSearch for 'anthropic' with ownership filter:`)
    console.log(`Found: ${searchResult.records.length} results`)
    searchResult.records.forEach(record => {
      console.log(`- workspace_id: ${record.get('workspace_id')}, user_id: ${record.get('user_id')}`)
    })
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await session.close()
    await driver.close()
  }
}

testOwnershipFilter().catch(console.error)