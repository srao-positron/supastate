#!/usr/bin/env tsx

import neo4j from 'neo4j-driver'
import { config } from 'dotenv'
import { resolve } from 'path'

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') })

const NEO4J_URI = process.env.NEO4J_URI!
const NEO4J_USER = process.env.NEO4J_USER!
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD!

if (!NEO4J_URI || !NEO4J_USER || !NEO4J_PASSWORD) {
  console.error('Missing required Neo4j environment variables')
  process.exit(1)
}

const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD))

async function checkNeo4jCodeData() {
  const session = driver.session()
  
  try {
    console.log('=== Checking Code Data in Neo4j ===\n')

    // 1. Count CodeEntity nodes
    console.log('1. CODEENTITY NODES:')
    const entityCountResult = await session.run(`
      MATCH (c:CodeEntity)
      RETURN COUNT(c) as total,
             COUNT(DISTINCT c.user_id) as unique_users,
             COUNT(DISTINCT c.workspace_id) as unique_workspaces
    `)
    const entityStats = entityCountResult.records[0]
    console.log(`Total CodeEntity nodes: ${entityStats.get('total')}`)
    console.log(`Unique users: ${entityStats.get('unique_users')}`)
    console.log(`Unique workspaces: ${entityStats.get('unique_workspaces')}`)

    // 2. Show recent CodeEntity nodes
    console.log('\n2. RECENT CODEENTITY NODES:')
    const recentEntitiesResult = await session.run(`
      MATCH (c:CodeEntity)
      RETURN c.name as name, c.type as type, c.user_id as user_id, 
             c.workspace_id as workspace_id, c.created_at as created_at
      ORDER BY c.created_at DESC
      LIMIT 10
    `)
    
    if (recentEntitiesResult.records.length > 0) {
      recentEntitiesResult.records.forEach(record => {
        console.log(`  - ${record.get('name')} (${record.get('type')})`)
        console.log(`    User: ${record.get('user_id')}, Workspace: ${record.get('workspace_id')}`)
        console.log(`    Created: ${record.get('created_at')}`)
      })
    } else {
      console.log('  No CodeEntity nodes found')
    }

    // 3. Check CodeChunk nodes
    console.log('\n3. CODECHUNK NODES:')
    const chunkCountResult = await session.run(`
      MATCH (chunk:CodeChunk)
      RETURN COUNT(chunk) as total,
             COUNT(DISTINCT chunk.user_id) as unique_users,
             COUNT(DISTINCT chunk.workspace_id) as unique_workspaces
    `)
    const chunkStats = chunkCountResult.records[0]
    console.log(`Total CodeChunk nodes: ${chunkStats.get('total')}`)
    console.log(`Unique users: ${chunkStats.get('unique_users')}`)
    console.log(`Unique workspaces: ${chunkStats.get('unique_workspaces')}`)

    // 4. Check relationships
    console.log('\n4. CODE RELATIONSHIPS:')
    const relCountResult = await session.run(`
      MATCH (c1:CodeEntity)-[r]-(c2:CodeEntity)
      RETURN TYPE(r) as rel_type, COUNT(r) as count
      ORDER BY count DESC
    `)
    
    if (relCountResult.records.length > 0) {
      console.log('CodeEntity relationships:')
      relCountResult.records.forEach(record => {
        console.log(`  - ${record.get('rel_type')}: ${record.get('count')}`)
      })
    } else {
      console.log('  No relationships between CodeEntity nodes found')
    }

    // 5. Check for Camille's data
    console.log('\n5. CAMILLE DATA CHECK:')
    const camilleResult = await session.run(`
      MATCH (n)
      WHERE n.user_id CONTAINS 'camille' OR n.metadata CONTAINS 'camille'
      RETURN labels(n)[0] as label, COUNT(n) as count
      ORDER BY count DESC
    `)
    
    if (camilleResult.records.length > 0) {
      console.log('Nodes with Camille references:')
      camilleResult.records.forEach(record => {
        console.log(`  - ${record.get('label')}: ${record.get('count')}`)
      })
    } else {
      console.log('  No nodes with Camille references found')
    }

    // 6. Check unique user IDs
    console.log('\n6. UNIQUE USER IDS IN NEO4J:')
    const userIdsResult = await session.run(`
      MATCH (n)
      WHERE n.user_id IS NOT NULL
      RETURN DISTINCT n.user_id as user_id
      ORDER BY user_id
      LIMIT 10
    `)
    
    if (userIdsResult.records.length > 0) {
      console.log('Sample user IDs:')
      userIdsResult.records.forEach(record => {
        console.log(`  - ${record.get('user_id')}`)
      })
    }

  } catch (error) {
    console.error('Error querying Neo4j:', error)
  } finally {
    await session.close()
    await driver.close()
  }
}

checkNeo4jCodeData().catch(console.error)