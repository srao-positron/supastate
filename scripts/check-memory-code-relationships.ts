#!/usr/bin/env npx tsx
import neo4j from 'neo4j-driver'

const NEO4J_URI = 'neo4j+s://eb61aceb.databases.neo4j.io'
const NEO4J_USER = 'neo4j'
const NEO4J_PASSWORD = 'XROfdG-0_Idz6zzm6s1C5Bwao6GgW_84T7BeT_uvtW8'

async function main() {
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
  )
  
  const session = driver.session()
  
  try {
    console.log('=== Checking Memory-Code Relationships ===\n')
    
    // Count RELATES_TO relationships
    const countResult = await session.run(`
      MATCH (m:Memory)-[r:RELATES_TO]-(c:CodeEntity)
      RETURN count(r) as totalRelationships,
             count(DISTINCT m) as uniqueMemories,
             count(DISTINCT c) as uniqueCodeEntities,
             collect(DISTINCT r.detection_method)[0..5] as sampleMethods
    `)
    
    const record = countResult.records[0]
    if (record) {
      const total = record.get('totalRelationships').toNumber()
      const memories = record.get('uniqueMemories').toNumber()
      const codeEntities = record.get('uniqueCodeEntities').toNumber()
      const methods = record.get('sampleMethods')
      
      console.log(`Total RELATES_TO relationships: ${total}`)
      console.log(`Unique memories with relationships: ${memories}`)
      console.log(`Unique code entities with relationships: ${codeEntities}`)
      console.log(`Detection methods: ${methods.join(', ')}`)
    } else {
      console.log('❌ No memory-code relationships found!')
    }
    
    // Check if EntitySummary nodes exist for both types
    console.log('\n=== EntitySummary Status ===\n')
    
    const summaryResult = await session.run(`
      MATCH (s:EntitySummary)
      WITH s.entity_type as type, count(s) as count
      RETURN type, count
      ORDER BY type
    `)
    
    for (const record of summaryResult.records) {
      console.log(`${record.get('type')}: ${record.get('count').toNumber()} summaries`)
    }
    
    // Sample some relationships
    console.log('\n=== Sample Memory-Code Relationships ===\n')
    
    const sampleResult = await session.run(`
      MATCH (m:Memory)-[r:RELATES_TO]-(c:CodeEntity)
      RETURN m.id as memoryId, 
             substring(m.content, 0, 100) as memorySnippet,
             c.name as codeName,
             c.path as codePath,
             r.similarity as similarity,
             r.detection_method as method,
             r.detected_at as detectedAt
      ORDER BY r.detected_at DESC
      LIMIT 5
    `)
    
    if (sampleResult.records.length > 0) {
      for (const record of sampleResult.records) {
        console.log(`Memory: ${record.get('memorySnippet')}...`)
        console.log(`  → Code: ${record.get('codeName')} (${record.get('codePath')})`)
        console.log(`  Method: ${record.get('method')}`)
        console.log(`  Similarity: ${record.get('similarity') || 'N/A'}`)
        console.log(`  Detected: ${new Date(record.get('detectedAt')).toLocaleString()}`)
        console.log()
      }
    }
    
    // Check for memories and code entities that should have relationships
    console.log('=== Checking Potential Relationships ===\n')
    
    const potentialResult = await session.run(`
      MATCH (m:Memory)
      MATCH (c:CodeEntity)
      WHERE m.project_name = c.project_name
        AND m.content CONTAINS c.name
        AND NOT EXISTS((m)-[:RELATES_TO]-(c))
      RETURN count(*) as potentialRelationships
      LIMIT 1
    `)
    
    const potential = potentialResult.records[0]?.get('potentialRelationships')?.toNumber() || 0
    console.log(`Potential name-based relationships not yet created: ${potential}`)
    
    // Check for memories and code with embeddings
    const embeddingResult = await session.run(`
      MATCH (ms:EntitySummary {entity_type: 'memory'})
      WHERE ms.embedding IS NOT NULL
      WITH count(ms) as memoriesWithEmbedding
      MATCH (cs:EntitySummary {entity_type: 'code'})
      WHERE cs.embedding IS NOT NULL
      RETURN memoriesWithEmbedding, count(cs) as codeWithEmbedding
    `)
    
    const embeddingRecord = embeddingResult.records[0]
    if (embeddingRecord) {
      console.log(`\nMemories with embeddings: ${embeddingRecord.get('memoriesWithEmbedding').toNumber()}`)
      console.log(`Code entities with embeddings: ${embeddingRecord.get('codeWithEmbedding').toNumber()}`)
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

main().catch(console.error)