import neo4j from 'neo4j-driver'
import { config } from 'dotenv'

config({ path: '.env.local' })

const driver = neo4j.driver(
  process.env.NEO4J_URI || '',
  neo4j.auth.basic(process.env.NEO4J_USER || '', process.env.NEO4J_PASSWORD || '')
)

async function checkIndexes() {
  const session = driver.session()
  
  try {
    // Show all indexes
    console.log('=== ALL INDEXES ===\n')
    const indexes = await session.run('SHOW INDEXES')
    
    // Group indexes by type
    const indexesByType: Record<string, any[]> = {}
    
    indexes.records.forEach(record => {
      const type = record.get('type')
      if (!indexesByType[type]) {
        indexesByType[type] = []
      }
      indexesByType[type].push({
        name: record.get('name'),
        labelsOrTypes: record.get('labelsOrTypes'),
        properties: record.get('properties'),
        state: record.get('state')
      })
    })
    
    // Display indexes by type
    Object.entries(indexesByType).forEach(([type, indexes]) => {
      console.log(`${type} INDEXES (${indexes.length}):`)
      indexes.forEach(idx => {
        console.log(`  ${idx.name}:`)
        console.log(`    Labels: ${idx.labelsOrTypes}`)
        console.log(`    Properties: ${idx.properties}`)
        console.log(`    State: ${idx.state}`)
      })
      console.log()
    })
    
    // Check what nodes have embeddings
    console.log('=== NODES WITH EMBEDDINGS ===\n')
    const nodeTypes = ['EntitySummary', 'PatternSummary', 'SessionSummary']
    
    for (const nodeType of nodeTypes) {
      const result = await session.run(`
        MATCH (n:${nodeType})
        WHERE n.embedding IS NOT NULL
        RETURN count(n) as count
      `)
      const count = result.records[0].get('count')
      console.log(`${nodeType}: ${count} nodes with embeddings`)
    }
    
    // Check missing indexes
    console.log('\n=== MISSING INDEXES RECOMMENDATIONS ===\n')
    
    // Check if we need vector indexes
    const hasEntitySummaryVector = indexes.records.some(r => 
      r.get('name') === 'entity_summary_embedding' && r.get('type') === 'VECTOR'
    )
    
    if (!hasEntitySummaryVector) {
      console.log('⚠️  Missing vector index on EntitySummary.embedding')
      console.log('   This is critical for semantic search and pattern detection')
    }
    
    // Check other important indexes
    const importantIndexes = [
      { label: 'Memory', property: 'id' },
      { label: 'Memory', property: 'occurred_at' },
      { label: 'CodeEntity', property: 'id' },
      { label: 'CodeEntity', property: 'file_path' },
      { label: 'Pattern', property: 'id' },
      { label: 'EntitySummary', property: 'entity_id' },
      { label: 'EntitySummary', property: 'entity_type' }
    ]
    
    for (const { label, property } of importantIndexes) {
      const hasIndex = indexes.records.some(r => {
        const labels = r.get('labelsOrTypes')
        const props = r.get('properties')
        return labels && labels.includes(label) && props && props.includes(property)
      })
      
      if (!hasIndex) {
        console.log(`⚠️  Missing index on ${label}.${property}`)
      }
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

checkIndexes()