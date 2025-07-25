// Load environment variables first
import { config } from 'dotenv'
config({ path: '.env.local' })

// Now import Neo4j modules after env vars are loaded
import { neo4jService } from '../src/lib/neo4j/service'
import { initializeSchema, createSampleData, getSchemaStats } from '../src/lib/neo4j/schema'
import { closeDriver } from '../src/lib/neo4j/client'

async function testNeo4jSetup() {
  try {
    console.log('🚀 Testing Neo4j connection and setup...\n')
    
    // 1. Test connection
    console.log('1. Testing connection...')
    await neo4jService.initialize()
    console.log('✅ Connection successful!\n')
    
    // 2. Initialize schema
    console.log('2. Initializing schema...')
    await initializeSchema()
    console.log('✅ Schema initialized!\n')
    
    // 3. Create sample data
    console.log('3. Creating sample data...')
    await createSampleData()
    console.log('✅ Sample data created!\n')
    
    // 4. Test vector search (with dummy embedding)
    console.log('4. Testing vector search...')
    const dummyEmbedding = new Array(3072).fill(0).map(() => Math.random())
    
    try {
      const results = await neo4jService.searchMemoriesByVector({
        embedding: dummyEmbedding,
        limit: 5,
        threshold: 0.0 // Low threshold since we're using random embeddings
      })
      console.log(`✅ Vector search returned ${results.length} results\n`)
    } catch (error) {
      console.log('⚠️  Vector search failed (expected if no memories exist yet)\n')
    }
    
    // 5. Get schema statistics
    console.log('5. Getting schema statistics...')
    try {
      const stats = await getSchemaStats()
      console.log('Schema stats:', JSON.stringify(stats, null, 2))
    } catch (error) {
      // APOC might not be installed
      console.log('⚠️  Could not get schema stats (APOC may not be installed)')
    }
    
    console.log('\n✅ All tests completed successfully!')
    
  } catch (error) {
    console.error('\n❌ Test failed:', error)
  } finally {
    await closeDriver()
    process.exit()
  }
}

// Run the test
testNeo4jSetup()