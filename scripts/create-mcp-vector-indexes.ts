#!/usr/bin/env npx tsx

import neo4j from 'neo4j-driver'

async function createVectorIndexes() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
  )
  
  const session = driver.session()
  
  try {
    // Create memory_embeddings index
    console.log('Creating memory_embeddings index...')
    try {
      await session.run(`
        CREATE VECTOR INDEX memory_embeddings IF NOT EXISTS
        FOR (m:Memory)
        ON m.embedding
        OPTIONS {
          indexConfig: {
            \`vector.dimensions\`: 3072,
            \`vector.similarity_function\`: 'cosine'
          }
        }
      `)
      console.log('✓ memory_embeddings index created')
    } catch (e: any) {
      if (e.message.includes('already exists')) {
        console.log('✓ memory_embeddings index already exists')
      } else {
        console.error('✗ Failed to create memory_embeddings index:', e.message)
      }
    }
    
    // Create code_embeddings index
    console.log('\nCreating code_embeddings index...')
    try {
      await session.run(`
        CREATE VECTOR INDEX code_embeddings IF NOT EXISTS
        FOR (c:CodeEntity)
        ON c.embedding
        OPTIONS {
          indexConfig: {
            \`vector.dimensions\`: 3072,
            \`vector.similarity_function\`: 'cosine'
          }
        }
      `)
      console.log('✓ code_embeddings index created')
    } catch (e: any) {
      if (e.message.includes('already exists')) {
        console.log('✓ code_embeddings index already exists')
      } else {
        console.error('✗ Failed to create code_embeddings index:', e.message)
      }
    }
    
    // Create unified_embeddings index (for all entity types)
    console.log('\nCreating unified_embeddings index...')
    try {
      // First check if entities have embeddings
      const checkQuery = `
        MATCH (n)
        WHERE n.embedding IS NOT NULL 
          AND (n:Memory OR n:CodeEntity OR n:GitHubEntity)
        RETURN labels(n) as labels, count(n) as count
        LIMIT 10
      `
      const checkResult = await session.run(checkQuery)
      console.log('Entities with embeddings:')
      checkResult.records.forEach(record => {
        console.log(`- ${record.get('labels').join(',')}: ${record.get('count')}`)
      })
      
      // Create a generic index that can work across multiple labels
      // Note: Neo4j doesn't support multi-label vector indexes directly
      // So we'll create separate indexes and the search can query multiple
      console.log('Note: unified_embeddings will be simulated by querying multiple indexes')
      
    } catch (e: any) {
      console.error('✗ Error checking unified embeddings:', e.message)
    }
    
    // Wait for indexes to come online
    console.log('\nWaiting for indexes to come online...')
    await new Promise(resolve => setTimeout(resolve, 5000))
    
    // Check index status
    console.log('\nChecking index status...')
    const statusQuery = `
      SHOW INDEXES
      WHERE type = 'VECTOR' AND name IN ['memory_embeddings', 'code_embeddings']
    `
    const statusResult = await session.run(statusQuery)
    statusResult.records.forEach(record => {
      const index = record.toObject()
      console.log(`- ${index.name}: ${index.state}`)
    })
    
  } finally {
    await session.close()
    await driver.close()
  }
}

// Load env
async function main() {
  const envPath = '.env.local'
  const envContent = await import('fs').then(fs => fs.promises.readFile(envPath, 'utf-8'))
  envContent.split('\n').forEach(line => {
    const [key, ...values] = line.split('=')
    if (key && values.length) {
      process.env[key] = values.join('=')
    }
  })
  
  await createVectorIndexes()
}

main().catch(console.error)