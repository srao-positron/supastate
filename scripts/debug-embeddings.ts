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
    console.log('=== Debugging Embeddings ===\n')
    
    // Check embedding sizes
    const embeddingSizes = await session.run(`
      MATCH (m:EntitySummary {entity_type: 'memory'})
      WHERE m.embedding IS NOT NULL
      WITH m LIMIT 1
      RETURN size(m.embedding) as memoryEmbeddingSize
    `)
    
    const codeEmbeddingSizes = await session.run(`
      MATCH (c:EntitySummary {entity_type: 'code'})
      WHERE c.embedding IS NOT NULL
      WITH c LIMIT 1
      RETURN size(c.embedding) as codeEmbeddingSize
    `)
    
    if (embeddingSizes.records.length > 0) {
      console.log(`Memory embedding size: ${embeddingSizes.records[0].get('memoryEmbeddingSize')}`)
    }
    
    if (codeEmbeddingSizes.records.length > 0) {
      console.log(`Code embedding size: ${codeEmbeddingSizes.records[0].get('codeEmbeddingSize')}`)
    }
    
    // Check for matching projects with both types
    const matchingProjects = await session.run(`
      MATCH (m:EntitySummary {entity_type: 'memory', project_name: 'camille'})
      WHERE m.embedding IS NOT NULL
      WITH count(m) as memCount
      MATCH (c:EntitySummary {entity_type: 'code', project_name: 'camille'})
      WHERE c.embedding IS NOT NULL
      RETURN memCount, count(c) as codeCount
    `)
    
    if (matchingProjects.records.length > 0) {
      const rec = matchingProjects.records[0]
      console.log(`\nProject 'camille' has:`)
      console.log(`  ${rec.get('memCount')} memory summaries with embeddings`)
      console.log(`  ${rec.get('codeCount')} code summaries with embeddings`)
    }
    
    // Try a simple similarity test with lower threshold
    console.log('\n=== Testing with Lower Threshold ===')
    
    const lowThresholdTest = await session.run(`
      MATCH (m:EntitySummary {entity_type: 'memory', project_name: 'camille'})
      WHERE m.embedding IS NOT NULL
      WITH m LIMIT 5
      MATCH (c:EntitySummary {entity_type: 'code', project_name: 'camille'})
      WHERE c.embedding IS NOT NULL
      WITH m, c, vector.similarity.cosine(m.embedding, c.embedding) as similarity
      WHERE similarity > 0.3  // Much lower threshold
      RETURN m.entity_id as memoryId,
             c.entity_id as codeId,
             similarity
      ORDER BY similarity DESC
      LIMIT 10
    `)
    
    console.log(`Found ${lowThresholdTest.records.length} matches with similarity > 0.3`)
    for (const record of lowThresholdTest.records) {
      console.log(`  Similarity: ${record.get('similarity')}`)
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

main().catch(console.error)