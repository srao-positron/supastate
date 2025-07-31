#!/usr/bin/env npx tsx

/**
 * Check embedding dimensions and format
 */

import * as dotenv from 'dotenv'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
)

async function checkEmbeddingSize() {
  const session = driver.session()
  
  try {
    console.log('=== Checking Embedding Size and Format ===\n')
    
    const result = await session.run(`
      MATCH (e:EntitySummary)
      WHERE e.embedding IS NOT NULL
      RETURN size(e.embedding) as size, e.id as id
      LIMIT 5
    `)
    
    result.records.forEach((record, idx) => {
      const size = record.get('size')
      const id = record.get('id')
      console.log(`${idx + 1}. Entity ${id}: ${size} dimensions`)
    })
    
    // Check if embeddings are stored as arrays
    const typeCheck = await session.run(`
      MATCH (e:EntitySummary)
      WHERE e.embedding IS NOT NULL
      WITH e.embedding as emb
      RETURN 
        size(emb) as size,
        emb[0] as firstValue,
        emb[1] as secondValue,
        emb[2] as thirdValue
      LIMIT 1
    `)
    
    if (typeCheck.records.length > 0) {
      const record = typeCheck.records[0]
      console.log('\nFirst 3 embedding values:')
      console.log(`  [0]: ${record.get('firstValue')}`)
      console.log(`  [1]: ${record.get('secondValue')}`)
      console.log(`  [2]: ${record.get('thirdValue')}`)
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

checkEmbeddingSize().catch(console.error)