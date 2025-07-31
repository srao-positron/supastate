#!/usr/bin/env npx tsx

/**
 * Check if test data made it to Neo4j
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

async function checkTestData() {
  const session = driver.session()
  
  try {
    console.log('=== Checking for Test Data in Neo4j ===\n')
    
    // Check for test memory
    const memoryResult = await session.run(`
      MATCH (m:Memory)
      WHERE m.content CONTAINS 'Test Memory - Pipeline Check'
      RETURN m.id, m.content, m.created_at
      ORDER BY m.created_at DESC
      LIMIT 5
    `)
    
    console.log(`Found ${memoryResult.records.length} test memory nodes:`)
    memoryResult.records.forEach(record => {
      const m = record.toObject()
      console.log(`  - Memory ${m['m.id']} created at ${m['m.created_at']}`)
    })
    
    // Check for test code entity
    const codeResult = await session.run(`
      MATCH (c:CodeEntity)
      WHERE c.path = 'test/pipeline-check.ts'
      RETURN c.id, c.path, c.created_at
      ORDER BY c.created_at DESC
      LIMIT 5
    `)
    
    console.log(`\nFound ${codeResult.records.length} test code entity nodes:`)
    codeResult.records.forEach(record => {
      const c = record.toObject()
      console.log(`  - CodeEntity ${c['c.id']} created at ${c['c.created_at']}`)
    })
    
    // Check most recent nodes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    
    const recentMemories = await session.run(`
      MATCH (m:Memory)
      WHERE m.created_at > $since
      RETURN count(m) as count
    `, { since: fiveMinutesAgo })
    
    const recentCode = await session.run(`
      MATCH (c:CodeEntity)  
      WHERE c.created_at > $since
      RETURN count(c) as count
    `, { since: fiveMinutesAgo })
    
    console.log('\nNodes created in last 5 minutes:')
    console.log(`  Memory nodes: ${recentMemories.records[0].get('count').toNumber()}`)
    console.log(`  CodeEntity nodes: ${recentCode.records[0].get('count').toNumber()}`)
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await session.close()
    await driver.close()
  }
}

checkTestData().catch(console.error)