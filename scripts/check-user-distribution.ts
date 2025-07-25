#!/usr/bin/env node
import neo4j from 'neo4j-driver'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

const NEO4J_URI = process.env.NEO4J_URI || 'neo4j+s://eb61aceb.databases.neo4j.io'
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j'
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD

if (!NEO4J_PASSWORD) {
  console.error('NEO4J_PASSWORD environment variable is required')
  process.exit(1)
}

async function checkUserDistribution() {
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD!)
  )

  const session = driver.session()

  try {
    // Check user_id distribution
    const result = await session.run(`
      MATCH (m:Memory) 
      RETURN DISTINCT m.user_id as user_id, count(m) as count 
      ORDER BY count DESC 
      LIMIT 10
    `)
    
    console.log('User ID distribution:')
    result.records.forEach(record => {
      const userId = record.get('user_id')
      const count = record.get('count')
      console.log(`  User: ${userId || 'NULL'}, Count: ${count}`)
    })
    
    // Check team_id distribution
    const teamResult = await session.run(`
      MATCH (m:Memory) 
      RETURN DISTINCT m.team_id as team_id, count(m) as count 
      ORDER BY count DESC 
      LIMIT 10
    `)
    
    console.log('\nTeam ID distribution:')
    teamResult.records.forEach(record => {
      const teamId = record.get('team_id')
      const count = record.get('count')
      console.log(`  Team: ${teamId || 'NULL'}, Count: ${count}`)
    })
    
    // Check the specific user
    const userCheckResult = await session.run(`
      MATCH (m:Memory)
      WHERE m.user_id = 'a02c3fed-3a24-442f-becc-97bac8b75e90'
      RETURN count(m) as count
    `)
    
    console.log('\nMemories for user a02c3fed-3a24-442f-becc-97bac8b75e90:', userCheckResult.records[0].get('count'))

  } finally {
    await session.close()
    await driver.close()
  }
}

checkUserDistribution().catch(console.error)