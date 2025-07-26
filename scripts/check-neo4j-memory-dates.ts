import neo4j from 'neo4j-driver'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const NEO4J_URI = process.env.NEO4J_URI || 'neo4j+s://eb61aceb.databases.neo4j.io'
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j'
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD!

async function checkNeo4jMemoryDates() {
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
  )

  const session = driver.session()

  try {
    console.log('Checking memory dates in Neo4j...\n')

    // Get sample of memories with their properties
    const result = await session.run(`
      MATCH (m:Memory)
      RETURN m, properties(m) as props
      ORDER BY m.created_at DESC
      LIMIT 20
    `)

    console.log(`Found ${result.records.length} memories\n`)

    const dateMap = new Map<string, number>()
    const hourMap = new Map<number, number>()
    const metadataTypes = new Map<string, number>()

    result.records.forEach((record, idx) => {
      const memory = record.get('m')
      const props = record.get('props')
      
      console.log(`Memory ${idx + 1}:`)
      console.log(`  ID: ${props.id?.slice(0, 8) || 'N/A'}`)
      console.log(`  Created At: ${props.created_at || 'NOT SET'}`)
      console.log(`  Project: ${props.project_name || 'N/A'}`)
      
      // Check if metadata is set and what type
      if (props.metadata) {
        try {
          const metadata = typeof props.metadata === 'string' 
            ? JSON.parse(props.metadata) 
            : props.metadata
          const type = metadata.type || metadata.messageType || 'general'
          metadataTypes.set(type, (metadataTypes.get(type) || 0) + 1)
          console.log(`  Metadata type: ${type}`)
          console.log(`  Metadata keys: ${Object.keys(metadata).join(', ')}`)
        } catch (e) {
          console.log(`  Metadata: PARSE ERROR`)
        }
      } else {
        console.log(`  Metadata: NOT SET`)
      }

      if (props.created_at) {
        const date = new Date(props.created_at)
        const dateStr = date.toISOString().split('T')[0]
        const hour = date.getHours()
        
        dateMap.set(dateStr, (dateMap.get(dateStr) || 0) + 1)
        hourMap.set(hour, (hourMap.get(hour) || 0) + 1)
      }
      
      console.log()
    })

    console.log('\nDate distribution:')
    if (dateMap.size === 0) {
      console.log('  NO DATES FOUND - created_at is not being set!')
    } else {
      for (const [date, count] of dateMap) {
        console.log(`  ${date}: ${count} memories`)
      }
    }

    console.log('\nHour distribution:')
    if (hourMap.size === 0) {
      console.log('  NO HOURS FOUND')
    } else {
      for (const [hour, count] of hourMap) {
        console.log(`  ${hour}:00: ${count} memories`)
      }
    }

    console.log('\nMemory types:')
    for (const [type, count] of metadataTypes) {
      console.log(`  ${type}: ${count} memories`)
    }

    // Check date range
    const dateRangeResult = await session.run(`
      MATCH (m:Memory)
      WHERE m.created_at IS NOT NULL
      RETURN MIN(m.created_at) as earliest, MAX(m.created_at) as latest, COUNT(m) as count
    `)

    const dateRange = dateRangeResult.records[0]
    console.log('\nDate range in Neo4j:')
    console.log(`  Earliest: ${dateRange.get('earliest') || 'N/A'}`)
    console.log(`  Latest: ${dateRange.get('latest') || 'N/A'}`)
    console.log(`  Count with dates: ${dateRange.get('count')}`)

    // Check how many memories have no created_at
    const noDateResult = await session.run(`
      MATCH (m:Memory)
      WHERE m.created_at IS NULL
      RETURN COUNT(m) as count
    `)
    console.log(`  Count without dates: ${noDateResult.records[0].get('count')}`)

  } finally {
    await session.close()
    await driver.close()
  }
}

checkNeo4jMemoryDates().then(() => {
  console.log('\nDone!')
  process.exit(0)
}).catch(err => {
  console.error('Error:', err)
  process.exit(1)
})