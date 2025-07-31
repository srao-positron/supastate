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
    console.log('=== Code Processing Verification ===\n')
    
    // Check EntitySummary nodes for code
    const summaries = await session.run(`
      MATCH (s:EntitySummary {entity_type: 'code'})
      RETURN count(s) as total,
             count(s.embedding) as withEmbedding,
             count(s.pattern_signals) as withSignals
    `)
    
    const summaryData = summaries.records[0]
    console.log(`EntitySummary nodes for code:`)
    console.log(`  Total: ${summaryData.get('total')}`)
    console.log(`  With embeddings: ${summaryData.get('withEmbedding')}`)
    console.log(`  With pattern signals: ${summaryData.get('withSignals')}`)
    
    // Sample some EntitySummary nodes
    const sampleSummaries = await session.run(`
      MATCH (s:EntitySummary {entity_type: 'code'})-[:SUMMARIZES]->(c:CodeEntity)
      RETURN s.entity_id as id, 
             c.name as name,
             c.language as language,
             s.pattern_signals as signals
      LIMIT 5
    `)
    
    if (sampleSummaries.records.length > 0) {
      console.log('\nSample EntitySummary nodes:')
      for (const record of sampleSummaries.records) {
        console.log(`  - ${record.get('name')} (${record.get('language')})`)
        const signals = record.get('signals')
        if (signals) {
          try {
            const parsed = JSON.parse(signals)
            const signalKeys = Object.keys(parsed).filter(k => parsed[k])
            if (signalKeys.length > 0) {
              console.log(`    Signals: ${signalKeys.slice(0, 3).join(', ')}...`)
            }
          } catch (e) {
            console.log(`    Signals: ${signals}`)
          }
        }
      }
    }
    
    // Check Memory-Code relationships
    console.log('\n=== Memory-Code Relationships ===')
    
    const relationships = await session.run(`
      MATCH (m:Memory)-[r:RELATES_TO]-(c:CodeEntity)
      RETURN count(r) as total,
             count(DISTINCT r.detection_method) as methods,
             collect(DISTINCT r.detection_method) as methodList
    `)
    
    const relData = relationships.records[0]
    console.log(`Total RELATES_TO relationships: ${relData.get('total')}`)
    console.log(`Detection methods: ${relData.get('methodList').join(', ')}`)
    
    // Sample some relationships
    const sampleRels = await session.run(`
      MATCH (m:Memory)-[r:RELATES_TO]-(c:CodeEntity)
      RETURN substring(m.content, 0, 50) as memory,
             c.name as code,
             r.detection_method as method,
             r.similarity as similarity,
             r.matched_name as matchedName
      ORDER BY r.detected_at DESC
      LIMIT 5
    `)
    
    if (sampleRels.records.length > 0) {
      console.log('\nSample relationships:')
      for (const record of sampleRels.records) {
        console.log(`  Memory: "${record.get('memory')}..."`)
        console.log(`    -> Code: ${record.get('code')}`)
        console.log(`    Method: ${record.get('method')}`)
        if (record.get('similarity')) {
          console.log(`    Similarity: ${record.get('similarity').toFixed(3)}`)
        }
        if (record.get('matchedName')) {
          console.log(`    Matched: ${record.get('matchedName')}`)
        }
        console.log()
      }
    }
    
    // Check code dependencies
    console.log('=== Code Dependencies ===')
    
    const imports = await session.run(`
      MATCH (c1:CodeEntity)-[r:IMPORTS]->(c2:CodeEntity)
      RETURN count(r) as total
    `)
    console.log(`Total IMPORTS relationships: ${imports.records[0].get('total')}`)
    
    const functions = await session.run(`
      MATCH (c:CodeEntity)-[:DEFINES_FUNCTION]->(f:Function)
      RETURN count(f) as total
    `)
    console.log(`Total Function nodes: ${functions.records[0].get('total')}`)
    
    const classes = await session.run(`
      MATCH (c:CodeEntity)-[:DEFINES_CLASS]->(cl:Class)
      RETURN count(cl) as total
    `)
    console.log(`Total Class nodes: ${classes.records[0].get('total')}`)
    
  } finally {
    await session.close()
    await driver.close()
  }
}

main().catch(console.error)