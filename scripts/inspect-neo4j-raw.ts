#!/usr/bin/env tsx
import { config } from 'dotenv'
import { resolve } from 'path'
import neo4j from 'neo4j-driver'

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') })

async function inspectRaw() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI || 'neo4j+s://eb61aceb.databases.neo4j.io',
    neo4j.auth.basic(
      process.env.NEO4J_USER || 'neo4j',
      process.env.NEO4J_PASSWORD!
    )
  )

  const session = driver.session()

  try {
    // Get first memory raw
    const result = await session.run(`
      MATCH (m:Memory)
      RETURN m
      LIMIT 1
    `)

    if (result.records.length > 0) {
      const record = result.records[0]
      const node = record.get('m')
      
      console.log('Raw record type:', typeof record)
      console.log('Raw node type:', typeof node)
      console.log('Node properties:', node.properties)
      console.log('\nFirst memory details:')
      console.log('ID:', node.properties.id)
      console.log('Content:', node.properties.content?.substring(0, 100) + '...')
      console.log('Project Name:', node.properties.project_name)
      console.log('Chunk ID:', node.properties.chunk_id)
      console.log('User ID:', node.properties.user_id)
      console.log('Team ID:', node.properties.team_id)
      console.log('Has Embedding:', !!node.properties.embedding)
      console.log('Embedding size:', node.properties.embedding?.length)
    } else {
      console.log('No memories found!')
    }

  } catch (error) {
    console.error('Error:', error)
  } finally {
    await session.close()
    await driver.close()
  }
}

inspectRaw().catch(console.error)