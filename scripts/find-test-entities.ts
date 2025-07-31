import { config } from 'dotenv'
import { executeQuery, verifyConnectivity, closeDriver } from '../src/lib/neo4j/client'

// Load environment variables
config({ path: '.env.local' })

async function findTestEntities() {
  try {
    await verifyConnectivity()
    console.log('Connected to Neo4j successfully\n')

    // 1. Find Memory nodes with REFERENCES_CODE relationships
    console.log('=== Memory nodes with REFERENCES_CODE relationships ===')
    const memoriesWithCode = await executeQuery(`
      MATCH (m:Memory)-[r:REFERENCES_CODE]->(c:CodeEntity)
      RETURN DISTINCT m.id as memoryId, m.content as content, count(r) as codeRefCount
      LIMIT 5
    `)
    
    if (memoriesWithCode.records.length > 0) {
      console.log('Found Memory nodes that reference code:')
      memoriesWithCode.records.forEach(record => {
        console.log(`- Memory ID: ${record.memoryId}`)
        console.log(`  Content: ${record.content?.substring(0, 100)}...`)
        console.log(`  References ${record.codeRefCount} code entities\n`)
      })
    } else {
      console.log('No Memory nodes with REFERENCES_CODE relationships found\n')
    }

    // 2. Find CodeEntity nodes with IMPORTS relationships
    console.log('=== CodeEntity nodes with IMPORTS relationships ===')
    const codeWithImports = await executeQuery(`
      MATCH (c1:CodeEntity)-[r:IMPORTS]->(c2:CodeEntity)
      RETURN DISTINCT c1.id as entityId, c1.name as name, c1.type as type, count(r) as importCount
      LIMIT 5
    `)
    
    if (codeWithImports.records.length > 0) {
      console.log('Found CodeEntity nodes with imports:')
      codeWithImports.records.forEach(record => {
        console.log(`- Code Entity ID: ${record.entityId}`)
        console.log(`  Name: ${record.name}`)
        console.log(`  Type: ${record.type}`)
        console.log(`  Imports ${record.importCount} other entities\n`)
      })
    } else {
      console.log('No CodeEntity nodes with IMPORTS relationships found\n')
    }

    // 3. Find CodeEntity nodes with DEFINES_FUNCTION relationships
    console.log('=== CodeEntity nodes with DEFINES_FUNCTION relationships ===')
    const codeWithFunctions = await executeQuery(`
      MATCH (c:CodeEntity)-[r:DEFINES_FUNCTION]->(f)
      RETURN DISTINCT c.id as entityId, c.name as name, c.type as type, count(r) as functionCount
      LIMIT 5
    `)
    
    if (codeWithFunctions.records.length > 0) {
      console.log('Found CodeEntity nodes that define functions:')
      codeWithFunctions.records.forEach(record => {
        console.log(`- Code Entity ID: ${record.entityId}`)
        console.log(`  Name: ${record.name}`)
        console.log(`  Type: ${record.type}`)
        console.log(`  Defines ${record.functionCount} functions\n`)
      })
    } else {
      console.log('No CodeEntity nodes with DEFINES_FUNCTION relationships found\n')
    }

    // 4. Check Memory nodes with embeddings via EntitySummary
    console.log('=== Memory nodes with embeddings via EntitySummary ===')
    const memoriesWithEmbeddings = await executeQuery(`
      MATCH (m:Memory)<-[:SUMMARIZES]-(s:EntitySummary)
      WHERE s.embedding IS NOT NULL
      RETURN DISTINCT m.id as memoryId, m.content as content, s.id as summaryId, 
             s.summary as summary, size(s.embedding) as embeddingSize
      LIMIT 5
    `)
    
    if (memoriesWithEmbeddings.records.length > 0) {
      console.log('Found Memory nodes with embeddings:')
      memoriesWithEmbeddings.records.forEach(record => {
        console.log(`- Memory ID: ${record.memoryId}`)
        console.log(`  Content: ${record.content?.substring(0, 100)}...`)
        console.log(`  Summary ID: ${record.summaryId}`)
        console.log(`  Summary: ${record.summary?.substring(0, 100)}...`)
        console.log(`  Embedding size: ${record.embeddingSize}\n`)
      })
    } else {
      console.log('No Memory nodes with embeddings found\n')
    }

    // 5. Check CodeEntity nodes with embeddings via EntitySummary
    console.log('=== CodeEntity nodes with embeddings via EntitySummary ===')
    const codeWithEmbeddings = await executeQuery(`
      MATCH (c:CodeEntity)<-[:SUMMARIZES]-(s:EntitySummary)
      WHERE s.embedding IS NOT NULL
      RETURN DISTINCT c.id as entityId, c.name as name, c.type as type, 
             s.id as summaryId, s.summary as summary, size(s.embedding) as embeddingSize
      LIMIT 5
    `)
    
    if (codeWithEmbeddings.records.length > 0) {
      console.log('Found CodeEntity nodes with embeddings:')
      codeWithEmbeddings.records.forEach(record => {
        console.log(`- Code Entity ID: ${record.entityId}`)
        console.log(`  Name: ${record.name}`)
        console.log(`  Type: ${record.type}`)
        console.log(`  Summary ID: ${record.summaryId}`)
        console.log(`  Summary: ${record.summary?.substring(0, 100)}...`)
        console.log(`  Embedding size: ${record.embeddingSize}\n`)
      })
    } else {
      console.log('No CodeEntity nodes with embeddings found\n')
    }

    // 6. Get overall statistics
    console.log('=== Overall Statistics ===')
    const stats = await executeQuery(`
      MATCH (n)
      WITH labels(n)[0] as label, count(n) as count
      RETURN label, count
      ORDER BY count DESC
    `)
    
    console.log('Node counts by type:')
    stats.records.forEach(record => {
      console.log(`- ${record.label}: ${record.count}`)
    })

    // 7. Check relationship counts
    console.log('\n=== Relationship Statistics ===')
    const relStats = await executeQuery(`
      MATCH ()-[r]->()
      WITH type(r) as relType, count(r) as count
      RETURN relType, count
      ORDER BY count DESC
      LIMIT 10
    `)
    
    console.log('Top 10 relationship types:')
    relStats.records.forEach(record => {
      console.log(`- ${record.relType}: ${record.count}`)
    })

  } catch (error) {
    console.error('Error finding test entities:', error)
  } finally {
    await closeDriver()
  }
}

// Run the script
findTestEntities().catch(console.error)