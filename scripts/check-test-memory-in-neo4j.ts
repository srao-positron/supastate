#!/usr/bin/env npx tsx

import neo4j from 'neo4j-driver'
import dotenv from 'dotenv'
import { resolve } from 'path'

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const NEO4J_URI = process.env.NEO4J_URI!
const NEO4J_USER = process.env.NEO4J_USER!
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD!

async function checkTestMemory() {
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
  )

  const session = driver.session()

  try {
    console.log('=== Checking for Test Memory in Neo4j ===\n')
    
    // Check for recent Memory nodes
    const result = await session.run(`
      MATCH (m:Memory)
      WHERE m.session_id STARTS WITH 'test-session-'
         OR m.content CONTAINS 'test message for Supastate'
      RETURN m.id as id,
             m.chunk_id as chunk_id,
             m.session_id as session_id,
             m.content as content,
             m.occurred_at as occurred_at,
             m.created_at as created_at,
             size(m.embedding) as embedding_size
      ORDER BY m.created_at DESC
      LIMIT 10
    `)
    
    console.log(`Found ${result.records.length} test memory nodes:\n`)
    
    result.records.forEach(record => {
      console.log(`Memory ID: ${record.get('id')}`)
      console.log(`  Session: ${record.get('session_id')}`)
      console.log(`  Chunk ID: ${record.get('chunk_id')}`)
      console.log(`  Content: ${record.get('content')?.substring(0, 100)}...`)
      console.log(`  Embedding size: ${record.get('embedding_size')}`)
      console.log(`  Created: ${record.get('created_at')}`)
      console.log()
    })

    // Check for any Memory nodes created in the last hour
    console.log('\n=== Recent Memory Nodes (last hour) ===\n')
    const recentResult = await session.run(`
      MATCH (m:Memory)
      WHERE m.created_at > datetime() - duration('PT1H')
      RETURN m.id as id,
             m.session_id as session_id,
             m.content as content,
             size(m.embedding) as embedding_size,
             m.created_at as created_at
      ORDER BY m.created_at DESC
      LIMIT 5
    `)
    
    console.log(`Found ${recentResult.records.length} recent memory nodes:\n`)
    
    recentResult.records.forEach(record => {
      console.log(`Memory ID: ${record.get('id')}`)
      console.log(`  Session: ${record.get('session_id')}`)
      console.log(`  Content preview: ${record.get('content')?.substring(0, 80)}...`)
      console.log(`  Embedding size: ${record.get('embedding_size')}`)
      console.log(`  Created: ${record.get('created_at')}`)
      console.log()
    })

  } finally {
    await session.close()
    await driver.close()
  }
}

checkTestMemory().catch(console.error)