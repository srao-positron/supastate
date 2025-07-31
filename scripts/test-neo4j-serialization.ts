import { neo4jService } from '@/lib/neo4j/service'
import { getOwnershipFilter, getOwnershipParams } from '@/lib/neo4j/query-patterns'

async function testSerialization() {
  console.log('Testing Neo4j date serialization...')
  
  try {
    // Initialize Neo4j
    await neo4jService.initialize()
    
    // Test query that returns dates
    const results = await neo4jService.executeQuery(`
      MATCH (m:Memory)
      WHERE m.occurred_at IS NOT NULL
      RETURN 
        m.id as id,
        m.occurred_at as occurred_at,
        m.created_at as created_at,
        m.updated_at as updated_at
      LIMIT 5
    `)
    
    console.log('Query results:')
    results.records.forEach((record, index) => {
      console.log(`\nRecord ${index + 1}:`)
      console.log('ID:', record.id)
      console.log('Occurred at:', record.occurred_at, typeof record.occurred_at)
      console.log('Created at:', record.created_at, typeof record.created_at)
      console.log('Updated at:', record.updated_at, typeof record.updated_at)
      
      // Try to create Date objects
      if (record.occurred_at) {
        try {
          const date = new Date(record.occurred_at)
          console.log('Parsed occurred_at:', date.toISOString())
        } catch (error) {
          console.error('Failed to parse occurred_at:', error)
        }
      }
    })
    
    // Test JSON stringification
    console.log('\nTesting JSON serialization:')
    try {
      const json = JSON.stringify(results.records[0])
      console.log('Successfully serialized to JSON')
      console.log('Sample:', json.substring(0, 200) + '...')
    } catch (error) {
      console.error('Failed to serialize to JSON:', error)
    }
    
  } catch (error) {
    console.error('Test failed:', error)
  } finally {
    process.exit(0)
  }
}

testSerialization()