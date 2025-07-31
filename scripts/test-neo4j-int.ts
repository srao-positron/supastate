#!/usr/bin/env npx tsx

import neo4j from 'neo4j-driver'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') })

async function testNeo4jInt() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI || 'neo4j://localhost:7687',
    neo4j.auth.basic(
      process.env.NEO4J_USERNAME || 'neo4j',
      process.env.NEO4J_PASSWORD || ''
    )
  )
  
  const session = driver.session()
  
  try {
    console.log('Testing Neo4j integer type...\n')
    
    // Test with regular number
    console.log('1. Testing with regular number (10):')
    try {
      await session.run('MATCH (n) RETURN n LIMIT $limit', { limit: 10 })
      console.log('   ❌ Regular number worked (should have failed)')
    } catch (error: any) {
      console.log('   ✅ Regular number failed as expected:', error.message)
    }
    
    // Test with neo4j.int()
    console.log('\n2. Testing with neo4j.int(10):')
    try {
      const result = await session.run('MATCH (n) RETURN count(n) as count LIMIT $limit', { limit: neo4j.int(10) })
      console.log('   ✅ neo4j.int() worked!')
      console.log('   Result:', result.records[0].get('count').toString())
    } catch (error: any) {
      console.log('   ❌ neo4j.int() failed:', error.message)
    }
    
    // Test executeQuery function
    console.log('\n3. Testing executeQuery function from client:')
    const { executeQuery } = await import('../src/lib/neo4j/client')
    
    try {
      const result = await executeQuery(
        'MATCH (m:Memory) WHERE m.workspace_id = $workspace RETURN count(m) as count LIMIT $limit',
        { workspace: 'user:a02c3fed-3a24-442f-becc-97bac8b75e90', limit: 10 }
      )
      console.log('   ✅ executeQuery with regular number worked!')
      console.log('   Count:', result.records[0].count)
    } catch (error: any) {
      console.log('   ❌ executeQuery failed:', error.message)
    }
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await session.close()
    await driver.close()
  }
}

testNeo4jInt().catch(console.error)