import neo4j from 'neo4j-driver'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const NEO4J_URI = process.env.NEO4J_URI || 'neo4j+s://eb61aceb.databases.neo4j.io'
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j'
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD!

async function checkMemoryDateDistribution() {
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
  )

  const session = driver.session()

  try {
    console.log('Checking memory date distribution for the last 30 days...\n')

    // First, check if occurred_at field exists
    const schemaCheck = await session.run(`
      MATCH (m:Memory)
      RETURN keys(m) as keys
      LIMIT 1
    `)

    if (schemaCheck.records.length > 0) {
      console.log('Memory node keys:', schemaCheck.records[0].get('keys'))
    }

    // Check distribution using occurred_at (if available)
    console.log('\n=== Checking occurred_at distribution ===')
    const occurredAtResult = await session.run(`
      MATCH (m:Memory)
      WHERE m.occurred_at IS NOT NULL 
        AND datetime(m.occurred_at) >= datetime() - duration({days: 30})
      WITH date(datetime(m.occurred_at)) as day, count(m) as count
      ORDER BY day
      RETURN day, count
    `)

    if (occurredAtResult.records.length > 0) {
      console.log('\nMemories by occurred_at date (last 30 days):')
      occurredAtResult.records.forEach(record => {
        const day = record.get('day')
        const count = record.get('count').toNumber()
        console.log(`  ${day}: ${count} memories`)
      })
    } else {
      console.log('No memories found with occurred_at in the last 30 days')
    }

    // Check distribution using created_at
    console.log('\n=== Checking created_at distribution ===')
    const createdAtResult = await session.run(`
      MATCH (m:Memory)
      WHERE m.created_at IS NOT NULL 
        AND datetime(m.created_at) >= datetime() - duration({days: 30})
      WITH date(datetime(m.created_at)) as day, count(m) as count
      ORDER BY day
      RETURN day, count
    `)

    if (createdAtResult.records.length > 0) {
      console.log('\nMemories by created_at date (last 30 days):')
      createdAtResult.records.forEach(record => {
        const day = record.get('day')
        const count = record.get('count').toNumber()
        console.log(`  ${day}: ${count} memories`)
      })
    } else {
      console.log('No memories found with created_at in the last 30 days')
    }

    // Get overall statistics
    console.log('\n=== Overall Statistics ===')
    const statsResult = await session.run(`
      MATCH (m:Memory)
      RETURN 
        count(m) as total_memories,
        count(m.occurred_at) as with_occurred_at,
        count(m.created_at) as with_created_at,
        min(m.occurred_at) as min_occurred_at,
        max(m.occurred_at) as max_occurred_at,
        min(m.created_at) as min_created_at,
        max(m.created_at) as max_created_at
    `)

    const stats = statsResult.records[0]
    console.log(`Total memories: ${stats.get('total_memories').toNumber()}`)
    console.log(`Memories with occurred_at: ${stats.get('with_occurred_at').toNumber()}`)
    console.log(`Memories with created_at: ${stats.get('with_created_at').toNumber()}`)
    console.log(`\noccurred_at range: ${stats.get('min_occurred_at')} to ${stats.get('max_occurred_at')}`)
    console.log(`created_at range: ${stats.get('min_created_at')} to ${stats.get('max_created_at')}`)

    // Check for memories with same timestamp (potential batch import issue)
    console.log('\n=== Checking for timestamp clustering ===')
    const clusteringResult = await session.run(`
      MATCH (m:Memory)
      WHERE m.created_at IS NOT NULL
      WITH m.created_at as timestamp, count(m) as count
      WHERE count > 10
      ORDER BY count DESC
      LIMIT 10
      RETURN timestamp, count
    `)

    if (clusteringResult.records.length > 0) {
      console.log('\nTimestamps with more than 10 memories:')
      clusteringResult.records.forEach(record => {
        const timestamp = record.get('timestamp')
        const count = record.get('count').toNumber()
        console.log(`  ${timestamp}: ${count} memories`)
      })
    } else {
      console.log('No significant timestamp clustering found')
    }

    // Sample some recent memories to see their date fields
    console.log('\n=== Sample of recent memories ===')
    const sampleResult = await session.run(`
      MATCH (m:Memory)
      RETURN m.id as id, m.occurred_at as occurred_at, m.created_at as created_at, m.content as content
      ORDER BY coalesce(m.occurred_at, m.created_at) DESC
      LIMIT 5
    `)

    sampleResult.records.forEach((record, idx) => {
      console.log(`\nMemory ${idx + 1}:`)
      console.log(`  ID: ${record.get('id')?.slice(0, 8) || 'N/A'}`)
      console.log(`  occurred_at: ${record.get('occurred_at') || 'NOT SET'}`)
      console.log(`  created_at: ${record.get('created_at') || 'NOT SET'}`)
      console.log(`  Content preview: ${record.get('content')?.slice(0, 50) || 'N/A'}...`)
    })

  } finally {
    await session.close()
    await driver.close()
  }
}

checkMemoryDateDistribution().then(() => {
  console.log('\nDone!')
  process.exit(0)
}).catch(err => {
  console.error('Error:', err)
  process.exit(1)
})