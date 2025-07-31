import neo4j from 'neo4j-driver'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

function getNeo4jDriver() {
  const uri = process.env.NEO4J_URI!
  const user = process.env.NEO4J_USER!
  const password = process.env.NEO4J_PASSWORD!
  
  return neo4j.driver(uri, neo4j.auth.basic(user, password))
}

async function checkMemoryOccurredDates() {
  console.log('Checking memory occurred_at dates in Neo4j...\n')

  const driver = getNeo4jDriver()
  const session = driver.session()

  try {
    // Check how many memories have occurred_at vs created_at
    const countResult = await session.run(`
      MATCH (m:Memory)
      RETURN 
        COUNT(m) as total,
        COUNT(m.occurred_at) as with_occurred_at,
        COUNT(m.created_at) as with_created_at
    `)
    
    const counts = countResult.records[0]
    console.log('Memory date field statistics:')
    console.log(`  Total memories: ${counts.get('total')}`)
    console.log(`  With occurred_at: ${counts.get('with_occurred_at')}`)
    console.log(`  With created_at: ${counts.get('with_created_at')}`)
    console.log(`  Missing occurred_at: ${counts.get('total').toNumber() - counts.get('with_occurred_at').toNumber()}`)
    
    // Check date distribution using occurred_at
    console.log('\nDate distribution (occurred_at):')
    const occurredResult = await session.run(`
      MATCH (m:Memory)
      WHERE m.occurred_at IS NOT NULL
      WITH date(datetime(m.occurred_at)) as day, COUNT(m) as count
      RETURN day, count
      ORDER BY day DESC
      LIMIT 30
    `)
    
    if (occurredResult.records.length === 0) {
      console.log('  No memories with occurred_at found!')
    } else {
      occurredResult.records.forEach(record => {
        console.log(`  ${record.get('day')}: ${record.get('count')} memories`)
      })
    }
    
    // Check date distribution using created_at for comparison
    console.log('\nDate distribution (created_at):')
    const createdResult = await session.run(`
      MATCH (m:Memory)
      WHERE m.created_at IS NOT NULL
      WITH date(datetime(m.created_at)) as day, COUNT(m) as count
      RETURN day, count
      ORDER BY day DESC
      LIMIT 30
    `)
    
    createdResult.records.forEach(record => {
      console.log(`  ${record.get('day')}: ${record.get('count')} memories`)
    })
    
    // Sample some memories to see their date fields
    console.log('\nSample memories with both dates:')
    const sampleResult = await session.run(`
      MATCH (m:Memory)
      WHERE m.occurred_at IS NOT NULL AND m.created_at IS NOT NULL
      RETURN m.id as id, m.project_name as project, m.occurred_at as occurred_at, m.created_at as created_at
      ORDER BY m.created_at DESC
      LIMIT 5
    `)
    
    sampleResult.records.forEach(record => {
      console.log(`\nMemory ${record.get('id')}:`)
      console.log(`  Project: ${record.get('project')}`)
      console.log(`  Occurred at: ${record.get('occurred_at')}`)
      console.log(`  Created at: ${record.get('created_at')}`)
    })
    
  } finally {
    await session.close()
    await driver.close()
  }
}

checkMemoryOccurredDates().catch(console.error)