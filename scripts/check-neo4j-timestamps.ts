import neo4j from 'neo4j-driver'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

async function checkNeo4jTimestamps() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI || 'neo4j+s://eb61aceb.databases.neo4j.io',
    neo4j.auth.basic(
      process.env.NEO4J_USER || 'neo4j',
      process.env.NEO4J_PASSWORD!
    )
  )

  const session = driver.session()

  try {
    console.log('Checking timestamps in Neo4j...\n')

    // Check CodeEntity timestamps
    const entityResult = await session.run(`
      MATCH (e:CodeEntity)
      RETURN 
        e.created_at as created_at,
        e.updated_at as updated_at,
        e.id as id,
        e.name as name
      LIMIT 10
    `)

    console.log('Sample CodeEntity timestamps:')
    entityResult.records.forEach((record, idx) => {
      console.log(`\nEntity ${idx + 1}:`)
      console.log(`  ID: ${record.get('id')}`)
      console.log(`  Name: ${record.get('name')}`)
      console.log(`  Created: ${record.get('created_at')}`)
      console.log(`  Updated: ${record.get('updated_at')}`)
    })

    // Check timestamp formats and ranges
    const timestampAnalysis = await session.run(`
      MATCH (e:CodeEntity)
      WITH e
      WHERE e.created_at IS NOT NULL
      RETURN 
        min(e.created_at) as min_created,
        max(e.created_at) as max_created,
        count(DISTINCT date(e.created_at)) as unique_days,
        count(e) as total_with_created
    `)

    const analysis = timestampAnalysis.records[0]
    console.log('\n\nTimestamp Analysis:')
    console.log(`Min created_at: ${analysis.get('min_created')}`)
    console.log(`Max created_at: ${analysis.get('max_created')}`)
    console.log(`Unique days: ${analysis.get('unique_days')?.toNumber() || 0}`)
    console.log(`Total with created_at: ${analysis.get('total_with_created')?.toNumber() || 0}`)

    // Check if timestamps are datetime objects or strings
    const typeCheck = await session.run(`
      MATCH (e:CodeEntity)
      WHERE e.created_at IS NOT NULL
      RETURN 
        e.created_at as timestamp,
        type(e.created_at) as timestamp_type
      LIMIT 5
    `)

    console.log('\n\nTimestamp Types:')
    typeCheck.records.forEach((record, idx) => {
      console.log(`${idx + 1}. Type: ${record.get('timestamp_type')}, Value: ${record.get('timestamp')}`)
    })

    // Check Memory node timestamps for comparison
    const memoryResult = await session.run(`
      MATCH (m:Memory)
      RETURN 
        min(m.occurred_at) as min_occurred,
        max(m.occurred_at) as max_occurred,
        count(DISTINCT date(m.occurred_at)) as unique_days,
        count(m) as total_memories
      LIMIT 1
    `)

    if (memoryResult.records.length > 0) {
      const memoryData = memoryResult.records[0]
      console.log('\n\nMemory Node Comparison:')
      console.log(`Min occurred_at: ${memoryData.get('min_occurred')}`)
      console.log(`Max occurred_at: ${memoryData.get('max_occurred')}`)
      console.log(`Unique days: ${memoryData.get('unique_days')?.toNumber() || 0}`)
      console.log(`Total memories: ${memoryData.get('total_memories')?.toNumber() || 0}`)
    }

    // Check workspace_id distribution
    const workspaceResult = await session.run(`
      MATCH (e:CodeEntity)
      RETURN 
        e.workspace_id as workspace_id,
        count(e) as count
      ORDER BY count DESC
    `)

    console.log('\n\nWorkspace Distribution:')
    workspaceResult.records.forEach(record => {
      console.log(`  ${record.get('workspace_id')}: ${record.get('count').toNumber()} entities`)
    })

  } finally {
    await session.close()
    await driver.close()
  }
}

checkNeo4jTimestamps().then(() => {
  console.log('\nDone!')
  process.exit(0)
}).catch(err => {
  console.error('Error:', err)
  process.exit(1)
})