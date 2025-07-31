#!/usr/bin/env tsx
import neo4j from 'neo4j-driver'
import dotenv from 'dotenv'
import path from 'path'

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

async function createIndexes() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI || 'neo4j+s://eb61aceb.databases.neo4j.io',
    neo4j.auth.basic(
      process.env.NEO4J_USER || 'neo4j',
      process.env.NEO4J_PASSWORD || ''
    )
  )

  const session = driver.session()

  try {
    console.log('Creating indexes for better query performance...')

    // Index on occurred_at for time-based queries
    console.log('Creating index on Memory.occurred_at...')
    await session.run(`
      CREATE INDEX memory_occurred_at IF NOT EXISTS
      FOR (m:Memory)
      ON (m.occurred_at)
    `)

    // Index on created_at as fallback
    console.log('Creating index on Memory.created_at...')
    await session.run(`
      CREATE INDEX memory_created_at IF NOT EXISTS
      FOR (m:Memory)
      ON (m.created_at)
    `)

    // Composite index for user queries with time
    console.log('Creating composite index on Memory(user_id, occurred_at)...')
    await session.run(`
      CREATE INDEX memory_user_occurred IF NOT EXISTS
      FOR (m:Memory)
      ON (m.user_id, m.occurred_at)
    `)

    // Composite index for team queries with time
    console.log('Creating composite index on Memory(team_id, occurred_at)...')
    await session.run(`
      CREATE INDEX memory_team_occurred IF NOT EXISTS
      FOR (m:Memory)
      ON (m.team_id, m.occurred_at)
    `)

    // Index on project_name for project-based queries
    console.log('Creating index on Memory.project_name...')
    await session.run(`
      CREATE INDEX memory_project_name IF NOT EXISTS
      FOR (m:Memory)
      ON (m.project_name)
    `)

    // Index on chunk_id for session queries
    console.log('Creating index on Memory.chunk_id...')
    await session.run(`
      CREATE INDEX memory_chunk_id IF NOT EXISTS
      FOR (m:Memory)
      ON (m.chunk_id)
    `)

    // Index on content_hash for deduplication
    console.log('Creating index on Memory.content_hash...')
    await session.run(`
      CREATE INDEX memory_content_hash IF NOT EXISTS
      FOR (m:Memory)
      ON (m.content_hash)
    `)

    // Show all indexes
    console.log('\nListing all indexes:')
    const result = await session.run('SHOW INDEXES')
    
    console.log('\nMemory-related indexes:')
    result.records.forEach(record => {
      const name = record.get('name')
      const entityType = record.get('entityType')
      const properties = record.get('properties')
      const state = record.get('state')
      
      if (entityType === 'NODE' && name.includes('memory')) {
        console.log(`- ${name}: ${properties} (${state})`)
      }
    })

    console.log('\nIndexes created successfully!')

  } catch (error) {
    console.error('Error creating indexes:', error)
  } finally {
    await session.close()
    await driver.close()
  }
}

// Run if called directly
if (require.main === module) {
  createIndexes()
}