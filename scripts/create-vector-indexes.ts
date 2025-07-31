import neo4j from 'neo4j-driver'
import { config } from 'dotenv'

config({ path: '.env.local' })

const driver = neo4j.driver(
  process.env.NEO4J_URI || '',
  neo4j.auth.basic(process.env.NEO4J_USER || '', process.env.NEO4J_PASSWORD || '')
)

async function createVectorIndexes() {
  const session = driver.session()
  
  try {
    console.log('Creating vector indexes for semantic search...\n')
    
    // Create vector index for EntitySummary embeddings
    // This is CRITICAL for semantic pattern detection and memory-code linking
    try {
      await session.run(`
        CREATE VECTOR INDEX entity_summary_embedding IF NOT EXISTS
        FOR (n:EntitySummary)
        ON (n.embedding)
        OPTIONS {
          indexConfig: {
            \`vector.dimensions\`: 3072,
            \`vector.similarity_function\`: 'cosine'
          }
        }
      `)
      console.log('✓ Created vector index for EntitySummary.embedding (3072 dimensions, cosine similarity)')
    } catch (error) {
      console.error('✗ Error creating EntitySummary vector index:', error.message)
    }
    
    // Create vector index for PatternSummary embeddings (for future use)
    try {
      await session.run(`
        CREATE VECTOR INDEX pattern_summary_embedding IF NOT EXISTS
        FOR (n:PatternSummary)
        ON (n.embedding)
        OPTIONS {
          indexConfig: {
            \`vector.dimensions\`: 3072,
            \`vector.similarity_function\`: 'cosine'
          }
        }
      `)
      console.log('✓ Created vector index for PatternSummary.embedding (prepared for future use)')
    } catch (error) {
      console.error('✗ Error creating PatternSummary vector index:', error.message)
    }
    
    // Create vector index for SessionSummary embeddings (for future use)
    try {
      await session.run(`
        CREATE VECTOR INDEX session_summary_embedding IF NOT EXISTS
        FOR (n:SessionSummary)
        ON (n.embedding)
        OPTIONS {
          indexConfig: {
            \`vector.dimensions\`: 3072,
            \`vector.similarity_function\`: 'cosine'
          }
        }
      `)
      console.log('✓ Created vector index for SessionSummary.embedding (prepared for future use)')
    } catch (error) {
      console.error('✗ Error creating SessionSummary vector index:', error.message)
    }
    
    console.log('\nCreating additional missing indexes...\n')
    
    // Create missing Pattern.id index
    try {
      await session.run(`
        CREATE INDEX pattern_id IF NOT EXISTS
        FOR (n:Pattern)
        ON (n.id)
      `)
      console.log('✓ Created index for Pattern.id')
    } catch (error) {
      console.error('✗ Error creating Pattern.id index:', error.message)
    }
    
    // Create missing EntitySummary.entity_id index
    try {
      await session.run(`
        CREATE INDEX entity_summary_entity_id IF NOT EXISTS
        FOR (n:EntitySummary)
        ON (n.entity_id)
      `)
      console.log('✓ Created index for EntitySummary.entity_id')
    } catch (error) {
      console.error('✗ Error creating EntitySummary.entity_id index:', error.message)
    }
    
    // Create composite index for EntitySummary lookups
    try {
      await session.run(`
        CREATE INDEX entity_summary_lookup IF NOT EXISTS
        FOR (n:EntitySummary)
        ON (n.entity_id, n.entity_type)
      `)
      console.log('✓ Created composite index for EntitySummary (entity_id, entity_type)')
    } catch (error) {
      console.error('✗ Error creating EntitySummary composite index:', error.message)
    }
    
    console.log('\nAll indexes created! Waiting for them to come online...')
    
    // Check index status
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    const indexes = await session.run(`
      SHOW INDEXES 
      WHERE name IN ['entity_summary_embedding', 'pattern_summary_embedding', 'session_summary_embedding', 
                     'pattern_id', 'entity_summary_entity_id', 'entity_summary_lookup']
    `)
    
    console.log('\nIndex Status:')
    indexes.records.forEach(record => {
      const name = record.get('name')
      const state = record.get('state')
      const type = record.get('type')
      console.log(`  ${name} (${type}): ${state}`)
    })
    
    // Test the vector index with a sample query
    console.log('\nTesting vector index with sample query...')
    const testResult = await session.run(`
      MATCH (e:EntitySummary)
      WHERE e.embedding IS NOT NULL
      WITH e LIMIT 1
      CALL db.index.vector.queryNodes('entity_summary_embedding', 5, e.embedding)
      YIELD node, score
      RETURN count(node) as similarCount
    `)
    
    if (testResult.records.length > 0) {
      const count = testResult.records[0].get('similarCount')
      console.log(`✓ Vector index test successful! Found ${count} similar entities`)
    }
    
  } catch (error) {
    console.error('Error creating indexes:', error)
  } finally {
    await session.close()
    await driver.close()
  }
}

createVectorIndexes()