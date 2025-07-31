/**
 * Check the exact structure of memory nodes
 */

import { neo4jService } from '../src/lib/neo4j/service'

async function checkMemoryStructure() {
  console.log('\n=== Checking Memory Node Structure ===')
  
  try {
    await neo4jService.initialize()
    
    // Get a sample memory to see all properties
    const query = `
      MATCH (m:Memory)
      WHERE m.project_name = 'supastate'
      RETURN m
      LIMIT 1
    `
    
    const result = await neo4jService.executeQuery(query, {})
    
    if (result.records.length > 0) {
      const record = result.records[0]
      const memory = record.get('m')
      const memoryProps = memory.properties
      
      console.log('\nMemory node properties:')
      console.log('Memory object type:', typeof memory)
      console.log('Memory properties:', memoryProps)
      
      // Check specific fields
      console.log('\nChecking embedding fields:')
      console.log('  embedding exists:', 'embedding' in memoryProps)
      console.log('  embedding type:', typeof memoryProps.embedding)
      console.log('  embedding_vector exists:', 'embedding_vector' in memoryProps)
      console.log('  embedding_vector type:', typeof memoryProps.embedding_vector)
      
      // List all property keys
      console.log('\nAll property keys:')
      Object.keys(memoryProps).forEach(key => {
        const value = memoryProps[key]
        const valueInfo = Array.isArray(value) ? `Array[${value.length}]` : 
                         typeof value === 'string' ? `String[${value.length} chars]` :
                         typeof value
        console.log(`  ${key}: ${valueInfo}`)
      })
      
      // If embedding exists, check its structure
      if (memoryProps.embedding) {
        console.log('\nEmbedding details:')
        if (typeof memoryProps.embedding === 'string') {
          console.log('  Stored as string')
          console.log('  Length:', memoryProps.embedding.length)
          console.log('  First 100 chars:', memoryProps.embedding.substring(0, 100))
          // Try to parse as JSON
          try {
            const parsed = JSON.parse(memoryProps.embedding)
            console.log('  Parsed as JSON array:', Array.isArray(parsed))
            console.log('  Array length:', parsed.length)
            console.log('  First 5 values:', parsed.slice(0, 5))
          } catch (e) {
            console.log('  Not valid JSON')
          }
        } else if (Array.isArray(memoryProps.embedding)) {
          console.log('  Stored as array')
          console.log('  Length:', memoryProps.embedding.length)
          console.log('  First 5 values:', memoryProps.embedding.slice(0, 5))
        }
      } else if (memoryProps.embedding_vector) {
        console.log('\nEmbedding_vector details:')
        if (typeof memoryProps.embedding_vector === 'string') {
          console.log('  Stored as string')
          console.log('  Length:', memoryProps.embedding_vector.length)
          console.log('  First 100 chars:', memoryProps.embedding_vector.substring(0, 100))
        } else if (Array.isArray(memoryProps.embedding_vector)) {
          console.log('  Stored as array')
          console.log('  Length:', memoryProps.embedding_vector.length)
          console.log('  First 5 values:', memoryProps.embedding_vector.slice(0, 5))
        }
      }
    }
    
    // Check how many memories have embeddings in different forms
    const statsQuery = `
      MATCH (m:Memory)
      RETURN 
        COUNT(m) as total,
        COUNT(CASE WHEN m.embedding IS NOT NULL THEN 1 END) as withEmbedding,
        COUNT(CASE WHEN m.embedding_vector IS NOT NULL THEN 1 END) as withEmbeddingVector,
        COUNT(CASE WHEN m.embeddings IS NOT NULL THEN 1 END) as withEmbeddings
    `
    
    const statsResult = await neo4jService.executeQuery(statsQuery, {})
    if (statsResult.records.length > 0) {
      const stats = statsResult.records[0]
      
      console.log('\nEmbedding field statistics:')
      console.log(`  Total memories: ${stats.get('total')}`)
      console.log(`  With 'embedding': ${stats.get('withEmbedding')}`)
      console.log(`  With 'embedding_vector': ${stats.get('withEmbeddingVector')}`)
      console.log(`  With 'embeddings': ${stats.get('withEmbeddings')}`)
    }
    
  } catch (error) {
    console.error('Check failed:', error)
  }
}

checkMemoryStructure().catch(console.error)