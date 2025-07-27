import { ingestionService } from '../src/lib/neo4j/ingestion'
import { executeQuery } from '../src/lib/neo4j/client'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

async function testMemoryDeduplication() {
  console.log('Testing memory deduplication...\n')

  const testMemory = {
    content: "This is a test memory about implementing a new feature for user authentication with OAuth2 support.",
    project_name: "test-project",
    user_id: "test-user-123",
    type: "conversation",
    metadata: {
      test: true,
      timestamp: new Date().toISOString()
    }
  }

  try {
    // First ingestion
    console.log('1. Ingesting memory for the first time...')
    const memory1 = await ingestionService.ingestMemory(testMemory)
    console.log(`   Created memory with ID: ${memory1.id}`)

    // Second ingestion with same content but different ID
    console.log('\n2. Ingesting same memory content again (should deduplicate)...')
    const memory2 = await ingestionService.ingestMemory({
      ...testMemory,
      id: 'different-id-456'
    })
    console.log(`   Returned memory with ID: ${memory2.id}`)

    // Check if they have the same ID (deduplication worked)
    if (memory1.id === memory2.id) {
      console.log('   ✅ Deduplication successful! Same memory returned.')
    } else {
      console.log('   ❌ Deduplication failed! Different memories created.')
    }

    // Query Neo4j to verify only one memory exists
    console.log('\n3. Verifying in Neo4j...')
    const result = await executeQuery(`
      MATCH (m:Memory)
      WHERE m.content = $content
      RETURN count(m) as count, collect(m.id) as ids, collect(m.content_hash) as hashes
    `, { content: testMemory.content })

    const count = result.records[0].get('count').toNumber()
    const ids = result.records[0].get('ids')
    const hashes = result.records[0].get('hashes')

    console.log(`   Found ${count} memory nodes with this content`)
    console.log(`   IDs: ${ids.join(', ')}`)
    console.log(`   Content hashes: ${hashes.join(', ')}`)

    if (count === 1) {
      console.log('   ✅ Only one memory exists in Neo4j - deduplication working!')
    } else {
      console.log('   ❌ Multiple memories found - deduplication not working properly')
    }

    // Test with slightly different content
    console.log('\n4. Testing with slightly different content...')
    const memory3 = await ingestionService.ingestMemory({
      ...testMemory,
      content: testMemory.content + " And some additional details."
    })
    console.log(`   Created memory with ID: ${memory3.id}`)
    
    if (memory3.id !== memory1.id) {
      console.log('   ✅ Different content created new memory - working as expected!')
    } else {
      console.log('   ❌ Different content returned same memory - too aggressive deduplication')
    }

    // Clean up test data
    console.log('\n5. Cleaning up test data...')
    await executeQuery(`
      MATCH (m:Memory)
      WHERE m.content CONTAINS "This is a test memory"
      AND m.metadata CONTAINS "test"
      DETACH DELETE m
    `)
    console.log('   ✅ Test data cleaned up')

  } catch (error) {
    console.error('Error during test:', error)
  }
}

testMemoryDeduplication().then(() => {
  console.log('\nTest completed!')
  process.exit(0)
}).catch(err => {
  console.error('Test failed:', err)
  process.exit(1)
})