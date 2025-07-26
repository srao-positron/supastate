import neo4j from 'neo4j-driver'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

async function createNeo4jIndexes() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI || 'neo4j+s://eb61aceb.databases.neo4j.io',
    neo4j.auth.basic(
      process.env.NEO4J_USER || 'neo4j',
      process.env.NEO4J_PASSWORD!
    )
  )

  const session = driver.session()

  try {
    console.log('Creating Neo4j indexes...\n')

    // Create index on content_hash for de-duplication
    console.log('Creating index on CodeEntity.content_hash...')
    try {
      await session.run(`
        CREATE INDEX entity_content_hash IF NOT EXISTS
        FOR (n:CodeEntity)
        ON (n.content_hash)
      `)
      console.log('✅ Created content_hash index')
    } catch (error: any) {
      if (error.message.includes('already exists')) {
        console.log('✅ content_hash index already exists')
      } else {
        console.error('❌ Error creating content_hash index:', error.message)
      }
    }

    // Create index on workspace_id for performance
    console.log('\nCreating index on CodeEntity.workspace_id...')
    try {
      await session.run(`
        CREATE INDEX entity_workspace_id IF NOT EXISTS
        FOR (n:CodeEntity)
        ON (n.workspace_id)
      `)
      console.log('✅ Created workspace_id index')
    } catch (error: any) {
      if (error.message.includes('already exists')) {
        console.log('✅ workspace_id index already exists')
      } else {
        console.error('❌ Error creating workspace_id index:', error.message)
      }
    }

    // Create index on project_name for filtering
    console.log('\nCreating index on CodeEntity.project_name...')
    try {
      await session.run(`
        CREATE INDEX entity_project_name IF NOT EXISTS
        FOR (n:CodeEntity)
        ON (n.project_name)
      `)
      console.log('✅ Created project_name index')
    } catch (error: any) {
      if (error.message.includes('already exists')) {
        console.log('✅ project_name index already exists')
      } else {
        console.error('❌ Error creating project_name index:', error.message)
      }
    }

    // Create composite index for better query performance
    console.log('\nCreating composite index on CodeEntity (project_name, name)...')
    try {
      await session.run(`
        CREATE INDEX entity_project_name_name IF NOT EXISTS
        FOR (n:CodeEntity)
        ON (n.project_name, n.name)
      `)
      console.log('✅ Created composite index')
    } catch (error: any) {
      if (error.message.includes('already exists')) {
        console.log('✅ Composite index already exists')
      } else {
        console.error('❌ Error creating composite index:', error.message)
      }
    }

    // List all indexes
    console.log('\nListing all indexes:')
    const indexResult = await session.run('SHOW INDEXES')
    
    indexResult.records.forEach(record => {
      const name = record.get('name')
      const state = record.get('state')
      const labelsOrTypes = record.get('labelsOrTypes')
      const properties = record.get('properties')
      
      if (labelsOrTypes?.includes('CodeEntity')) {
        console.log(`  ${name}: ${labelsOrTypes} (${properties}) - ${state}`)
      }
    })

  } catch (error) {
    console.error('Error creating indexes:', error)
  } finally {
    await session.close()
    await driver.close()
  }
}

createNeo4jIndexes().then(() => {
  console.log('\nDone!')
  process.exit(0)
}).catch(err => {
  console.error('Error:', err)
  process.exit(1)
})