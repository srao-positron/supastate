/**
 * Quick test to check memory embeddings
 */

import { neo4jService } from '../src/lib/neo4j/service'

async function testMemoryEmbeddings() {
  console.log('\n=== Testing Memory Embeddings ===')
  
  try {
    await neo4jService.initialize()
    
    // Simple query to get one memory
    const query = `
      MATCH (m:Memory)
      WHERE m.project_name = 'supastate'
      RETURN m.id as id, 
             m.content as content,
             m.embedding as embedding,
             m.embedding_vector as embedding_vector,
             keys(m) as allKeys
      LIMIT 1
    `
    
    const result = await neo4jService.executeQuery(query, {})
    
    if (result.records.length > 0) {
      const record = result.records[0]
      console.log('\nRecord structure:')
      console.log('  Record type:', typeof record)
      console.log('  Record constructor:', record.constructor.name)
      
      // Try different ways to access data
      console.log('\nTrying different access methods:')
      
      try {
        console.log('  Direct access (record.id):', record.id)
      } catch (e) {
        console.log('  Direct access failed:', e.message)
      }
      
      try {
        console.log('  Get method (record.get("id")):', record.get?.('id'))
      } catch (e) {
        console.log('  Get method failed:', e.message)
      }
      
      try {
        const keys = record.allKeys || record.get?.('allKeys')
        console.log('\nAll keys in memory node:', keys)
      } catch (e) {
        console.log('  Failed to get keys:', e.message)
      }
      
      // Check embedding specifically
      try {
        const embedding = record.embedding || record.get?.('embedding')
        if (embedding) {
          console.log('\nEmbedding found!')
          console.log('  Type:', typeof embedding)
          console.log('  Is Array:', Array.isArray(embedding))
          if (Array.isArray(embedding)) {
            console.log('  Length:', embedding.length)
            console.log('  First 5 values:', embedding.slice(0, 5))
          } else if (typeof embedding === 'string') {
            console.log('  String length:', embedding.length)
            console.log('  First 50 chars:', embedding.substring(0, 50))
          }
        } else {
          console.log('\nNo embedding field found')
        }
      } catch (e) {
        console.log('  Failed to check embedding:', e.message)
      }
    }
    
    // Count memories with embeddings
    const countQuery = `
      MATCH (m:Memory)
      WHERE m.project_name = 'supastate'
      RETURN COUNT(m) as total,
             COUNT(CASE WHEN m.embedding IS NOT NULL THEN 1 END) as withEmbedding
    `
    
    const countResult = await neo4jService.executeQuery(countQuery, {})
    if (countResult.records.length > 0) {
      const stats = countResult.records[0]
      const total = stats.total || stats.get?.('total')
      const withEmbedding = stats.withEmbedding || stats.get?.('withEmbedding')
      
      console.log('\nMemory statistics:')
      console.log(`  Total memories: ${total}`)
      console.log(`  With embeddings: ${withEmbedding}`)
    }
    
  } catch (error) {
    console.error('Test failed:', error)
  } finally {
    await neo4jService.close()
  }
}

testMemoryEmbeddings().catch(console.error)