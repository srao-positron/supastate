/**
 * Check if embeddings exist in Neo4j
 */

import { neo4jService } from '../src/lib/neo4j/service'

async function checkEmbeddings() {
  console.log('\n=== Checking Embeddings in Neo4j ===')
  
  try {
    await neo4jService.initialize()
    
    // Check memories with embeddings
    const memoryQuery = `
      MATCH (m:Memory)
      RETURN 
        COUNT(m) as totalMemories,
        COUNT(CASE WHEN m.embedding IS NOT NULL THEN 1 END) as memoriesWithEmbeddings,
        COUNT(DISTINCT m.project_name) as projects
    `
    
    const memoryResult = await neo4jService.executeQuery(memoryQuery, {})
    const memoryStats = memoryResult.records[0]
    
    console.log('\nMemory Embeddings:')
    console.log(`  Total memories: ${memoryStats.totalMemories?.toNumber() || 0}`)
    console.log(`  With embeddings: ${memoryStats.memoriesWithEmbeddings?.toNumber() || 0}`)
    console.log(`  Projects: ${memoryStats.projects?.toNumber() || 0}`)
    
    // Check code entities with embeddings
    const codeQuery = `
      MATCH (c:CodeEntity)
      RETURN 
        COUNT(c) as totalEntities,
        COUNT(CASE WHEN c.embedding IS NOT NULL THEN 1 END) as entitiesWithEmbeddings,
        COUNT(DISTINCT c.project_name) as projects
    `
    
    const codeResult = await neo4jService.executeQuery(codeQuery, {})
    const codeStats = codeResult.records[0]
    
    console.log('\nCode Entity Embeddings:')
    console.log(`  Total entities: ${codeStats.totalEntities?.toNumber() || 0}`)
    console.log(`  With embeddings: ${codeStats.entitiesWithEmbeddings?.toNumber() || 0}`)
    console.log(`  Projects: ${codeStats.projects?.toNumber() || 0}`)
    
    // Check if embeddings are stored as arrays or strings
    const sampleQuery = `
      MATCH (m:Memory)
      WHERE m.embedding IS NOT NULL
      RETURN m.id, m.embedding
      LIMIT 1
    `
    
    const sampleResult = await neo4jService.executeQuery(sampleQuery, {})
    if (sampleResult.records.length > 0) {
      const embedding = sampleResult.records[0].embedding
      console.log('\nEmbedding sample:')
      console.log(`  Type: ${typeof embedding}`)
      console.log(`  Is Array: ${Array.isArray(embedding)}`)
      if (typeof embedding === 'string') {
        console.log(`  String length: ${embedding.length}`)
        console.log(`  Starts with: ${embedding.substring(0, 50)}...`)
      } else if (Array.isArray(embedding)) {
        console.log(`  Array length: ${embedding.length}`)
        console.log(`  First 5 values: ${embedding.slice(0, 5)}`)
      }
    }
    
    // Check relationships
    const relationshipQuery = `
      MATCH ()-[r]->()
      WHERE type(r) IN ['DISCUSSES', 'PRECEDED_BY', 'RELATED_TO', 'FOLLOWED_BY_IN_CHUNK']
      RETURN type(r) as relType, COUNT(r) as count
      ORDER BY count DESC
    `
    
    const relResult = await neo4jService.executeQuery(relationshipQuery, {})
    console.log('\nExisting Relationships:')
    relResult.records.forEach(record => {
      console.log(`  ${record.relType}: ${record.count?.toNumber() || 0}`)
    })
    
  } catch (error) {
    console.error('Check failed:', error)
  }
}

checkEmbeddings().catch(console.error)