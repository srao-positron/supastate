#!/usr/bin/env npx tsx

/**
 * Check Neo4j for recent Memory and CodeEntity nodes
 */

import neo4j from 'neo4j-driver'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const NEO4J_URI = process.env.NEO4J_URI || 'neo4j+s://eb61aceb.databases.neo4j.io'
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j'
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD

if (!NEO4J_PASSWORD) {
  console.error('NEO4J_PASSWORD environment variable is required')
  process.exit(1)
}

const driver = neo4j.driver(
  NEO4J_URI,
  neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
)

async function checkRecentData() {
  const session = driver.session()
  
  try {
    console.log('=== Checking Neo4j for Recent Data ===\n')
    
    // Check recent Memory nodes
    console.log('Recent Memory nodes:')
    const memoryResult = await session.run(`
      MATCH (m:Memory)
      WHERE m.created_at IS NOT NULL
      RETURN m.id, m.title, m.created_at, m.user_id, m.workspace_id
      ORDER BY m.created_at DESC
      LIMIT 10
    `)
    
    if (memoryResult.records.length === 0) {
      console.log('  No Memory nodes found')
    } else {
      memoryResult.records.forEach(record => {
        const memory = record.toObject()
        console.log(`  - ${memory['m.title'] || 'Untitled'} (${memory['m.created_at']})`)
        console.log(`    ID: ${memory['m.id']}`)
        console.log(`    User: ${memory['m.user_id']}, Workspace: ${memory['m.workspace_id'] || 'none'}`)
      })
    }
    
    // Check recent CodeEntity nodes
    console.log('\n\nRecent CodeEntity nodes:')
    const codeResult = await session.run(`
      MATCH (c:CodeEntity)
      WHERE c.created_at IS NOT NULL
      RETURN c.id, c.path, c.created_at, c.user_id, c.workspace_id
      ORDER BY c.created_at DESC
      LIMIT 10
    `)
    
    if (codeResult.records.length === 0) {
      console.log('  No CodeEntity nodes found')
    } else {
      codeResult.records.forEach(record => {
        const code = record.toObject()
        console.log(`  - ${code['c.path']} (${code['c.created_at']})`)
        console.log(`    ID: ${code['c.id']}`)
        console.log(`    User: ${code['c.user_id']}, Workspace: ${code['c.workspace_id'] || 'none'}`)
      })
    }
    
    // Check nodes created in the last hour
    console.log('\n\nNodes created in the last hour:')
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    
    const recentMemories = await session.run(`
      MATCH (m:Memory)
      WHERE m.created_at > $oneHourAgo
      RETURN count(m) as count
    `, { oneHourAgo })
    
    const recentCode = await session.run(`
      MATCH (c:CodeEntity)
      WHERE c.created_at > $oneHourAgo
      RETURN count(c) as count
    `, { oneHourAgo })
    
    console.log(`  Memory nodes: ${recentMemories.records[0].get('count').toNumber()}`)
    console.log(`  CodeEntity nodes: ${recentCode.records[0].get('count').toNumber()}`)
    
    // Check total counts
    console.log('\n\nTotal node counts:')
    const totalMemories = await session.run(`
      MATCH (m:Memory)
      RETURN count(m) as count
    `)
    
    const totalCode = await session.run(`
      MATCH (c:CodeEntity)
      RETURN count(c) as count
    `)
    
    console.log(`  Total Memory nodes: ${totalMemories.records[0].get('count').toNumber()}`)
    console.log(`  Total CodeEntity nodes: ${totalCode.records[0].get('count').toNumber()}`)
    
  } catch (error) {
    console.error('Error querying Neo4j:', error)
  } finally {
    await session.close()
    await driver.close()
  }
}

checkRecentData().catch(console.error)