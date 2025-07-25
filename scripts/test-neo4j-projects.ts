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

async function testProjectsQuery() {
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD!)
  )

  const session = driver.session()

  try {
    // Test the exact query from the edge function
    console.log('Testing projects query...')
    
    const result = await session.run(`
      MATCH (m:Memory)
      WITH m.project_name as project_name, 
           COALESCE(m.team_id, m.user_id) as workspace_id,
           m.created_at as created_at
      WITH project_name, workspace_id, max(created_at) as latest_created_at
      WHERE project_name IS NOT NULL AND workspace_id IS NOT NULL
      RETURN project_name, workspace_id, latest_created_at
      ORDER BY latest_created_at DESC
      LIMIT 10
    `)

    console.log(`Found ${result.records.length} project records`)
    
    result.records.forEach((record, index) => {
      console.log(`\nProject ${index + 1}:`)
      console.log('  project_name:', record.get('project_name'))
      console.log('  workspace_id:', record.get('workspace_id'))
      console.log('  latest:', record.get('latest_created_at').toString())
    })

    // Check if team_id or user_id is actually populated
    console.log('\n\nChecking team_id and user_id values:')
    const checkResult = await session.run(`
      MATCH (m:Memory)
      RETURN DISTINCT m.team_id as team_id, m.user_id as user_id
      LIMIT 10
    `)

    checkResult.records.forEach(record => {
      console.log('team_id:', record.get('team_id'), 'user_id:', record.get('user_id'))
    })

  } finally {
    await session.close()
    await driver.close()
  }
}

testProjectsQuery().catch(console.error)