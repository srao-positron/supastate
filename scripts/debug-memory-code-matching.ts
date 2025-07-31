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
    console.log('=== Debugging Memory-Code Matching ===\n')
    
    // Check if we have matching projects
    const projects = await session.run(`
      MATCH (m:Memory)
      WITH DISTINCT m.project_name as project, count(DISTINCT m) as memoryCount
      MATCH (c:CodeEntity {project_name: project})
      WITH project, memoryCount, count(DISTINCT c) as codeCount
      RETURN project, memoryCount, codeCount
      LIMIT 5
    `)
    
    console.log('Projects with both memories and code:')
    for (const record of projects.records) {
      console.log(`  ${record.get('project')}: ${record.get('memoryCount')} memories, ${record.get('codeCount')} code files`)
    }
    
    // Check EntitySummary matching
    const summaryMatch = await session.run(`
      MATCH (m:EntitySummary {entity_type: 'memory'})
      WITH m.project_name as project, count(m) as memCount
      MATCH (c:EntitySummary {entity_type: 'code', project_name: project})
      RETURN project, memCount, count(c) as codeCount
      LIMIT 5
    `)
    
    console.log('\nEntitySummary matching by project:')
    for (const record of summaryMatch.records) {
      console.log(`  ${record.get('project')}: ${record.get('memCount')} memory summaries, ${record.get('codeCount')} code summaries`)
    }
    
    // Test semantic similarity manually
    console.log('\n=== Testing Semantic Similarity ===')
    
    const testSimilarity = await session.run(`
      MATCH (m:EntitySummary {entity_type: 'memory'})
      WHERE m.embedding IS NOT NULL
      WITH m LIMIT 1
      MATCH (c:EntitySummary {entity_type: 'code'})
      WHERE c.embedding IS NOT NULL 
        AND c.project_name = m.project_name
      WITH m, c, vector.similarity.cosine(m.embedding, c.embedding) as similarity
      ORDER BY similarity DESC
      LIMIT 5
      RETURN m.entity_id as memoryId,
             substring(m.keyword_frequencies, 0, 50) as memKeywords,
             c.entity_id as codeId,
             c.metadata as codeMetadata,
             similarity
    `)
    
    if (testSimilarity.records.length > 0) {
      console.log('Top semantic matches:')
      for (const record of testSimilarity.records) {
        console.log(`  Memory ${record.get('memoryId').substring(0, 8)}... -> Code ${record.get('codeId').substring(0, 8)}...`)
        console.log(`    Similarity: ${record.get('similarity')}`)
      }
    } else {
      console.log('No semantic matches found!')
    }
    
    // Check name matching potential
    console.log('\n=== Testing Name Matching ===')
    
    const nameMatches = await session.run(`
      MATCH (c:CodeEntity)
      WHERE c.name IS NOT NULL 
        AND size(c.name) > 3
        AND c.name <> 'index.ts'
        AND c.name <> 'package.json'
      WITH c.name as codeName, c
      LIMIT 10
      OPTIONAL MATCH (m:Memory)
      WHERE m.content CONTAINS codeName
        AND m.project_name = c.project_name
      RETURN codeName, count(m) as matchCount
      ORDER BY matchCount DESC
    `)
    
    console.log('Code names that could match memories:')
    for (const record of nameMatches.records) {
      const count = record.get('matchCount').toNumber()
      if (count > 0) {
        console.log(`  ${record.get('codeName')}: ${count} potential matches`)
      }
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

main().catch(console.error)