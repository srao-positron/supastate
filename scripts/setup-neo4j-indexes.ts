/**
 * Create Neo4j indexes for efficient pattern discovery
 */

import { neo4jService } from '../src/lib/neo4j/service'
import { log } from '@/lib/logger'

async function createIndexes() {
  console.log('\n=== Creating Neo4j Indexes ===')
  
  try {
    await neo4jService.initialize()
    
    // Check existing indexes
    console.log('\nChecking existing indexes...')
    const showIndexesQuery = `SHOW INDEXES`
    
    try {
      const indexResult = await neo4jService.executeQuery(showIndexesQuery, {})
      console.log('Existing indexes:')
      indexResult.records.forEach(record => {
        const name = record.get('name')
        const type = record.get('type')
        const state = record.get('state')
        console.log(`  ${name} (${type}) - ${state}`)
      })
    } catch (error) {
      console.log('Could not list indexes:', error.message)
    }
    
    // Create vector indexes for embeddings
    console.log('\nCreating vector indexes...')
    
    const vectorIndexes = [
      {
        name: 'memory_embeddings',
        query: `
          CREATE VECTOR INDEX memory_embeddings IF NOT EXISTS
          FOR (m:Memory)
          ON m.embedding
          OPTIONS {indexConfig: {
            \`vector.dimensions\`: 3072,
            \`vector.similarity_function\`: 'cosine'
          }}
        `
      },
      {
        name: 'code_embeddings',
        query: `
          CREATE VECTOR INDEX code_embeddings IF NOT EXISTS
          FOR (c:CodeEntity)
          ON c.embedding
          OPTIONS {indexConfig: {
            \`vector.dimensions\`: 3072,
            \`vector.similarity_function\`: 'cosine'
          }}
        `
      }
    ]
    
    for (const index of vectorIndexes) {
      try {
        await neo4jService.executeQuery(index.query, {})
        console.log(`✓ Created vector index: ${index.name}`)
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`  Index ${index.name} already exists`)
        } else {
          console.error(`✗ Failed to create ${index.name}:`, error.message)
        }
      }
    }
    
    // Create text indexes for efficient keyword search
    console.log('\nCreating text indexes...')
    
    const textIndexes = [
      {
        name: 'memory_content_index',
        query: `
          CREATE TEXT INDEX memory_content_index IF NOT EXISTS
          FOR (m:Memory)
          ON m.content
        `
      },
      {
        name: 'code_name_index',
        query: `
          CREATE TEXT INDEX code_name_index IF NOT EXISTS
          FOR (c:CodeEntity)
          ON c.name
        `
      }
    ]
    
    for (const index of textIndexes) {
      try {
        await neo4jService.executeQuery(index.query, {})
        console.log(`✓ Created text index: ${index.name}`)
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`  Index ${index.name} already exists`)
        } else {
          console.error(`✗ Failed to create ${index.name}:`, error.message)
        }
      }
    }
    
    // Create regular indexes for common queries
    console.log('\nCreating performance indexes...')
    
    const performanceIndexes = [
      {
        name: 'memory_created_at',
        query: `CREATE INDEX memory_created_at IF NOT EXISTS FOR (m:Memory) ON (m.created_at)`
      },
      {
        name: 'memory_project_name',
        query: `CREATE INDEX memory_project_name IF NOT EXISTS FOR (m:Memory) ON (m.project_name)`
      },
      {
        name: 'memory_user_id',
        query: `CREATE INDEX memory_user_id IF NOT EXISTS FOR (m:Memory) ON (m.user_id)`
      },
      {
        name: 'code_project_name',
        query: `CREATE INDEX code_project_name IF NOT EXISTS FOR (c:CodeEntity) ON (c.project_name)`
      },
      {
        name: 'code_type',
        query: `CREATE INDEX code_type IF NOT EXISTS FOR (c:CodeEntity) ON (c.type)`
      },
      {
        name: 'memory_composite',
        query: `CREATE INDEX memory_composite IF NOT EXISTS FOR (m:Memory) ON (m.project_name, m.created_at)`
      }
    ]
    
    for (const index of performanceIndexes) {
      try {
        await neo4jService.executeQuery(index.query, {})
        console.log(`✓ Created index: ${index.name}`)
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`  Index ${index.name} already exists`)
        } else {
          console.error(`✗ Failed to create ${index.name}:`, error.message)
        }
      }
    }
    
    // Wait for indexes to be populated
    console.log('\nWaiting for indexes to be populated...')
    await new Promise(resolve => setTimeout(resolve, 5000))
    
    // Check index status
    console.log('\nChecking index status...')
    try {
      const statusResult = await neo4jService.executeQuery(`
        SHOW INDEXES
        WHERE state = 'ONLINE'
        RETURN name, type
      `, {})
      
      console.log('Online indexes:')
      statusResult.records.forEach(record => {
        console.log(`  ✓ ${record.get('name')} (${record.get('type')})`)
      })
    } catch (error) {
      console.log('Could not check index status')
    }
    
  } catch (error) {
    console.error('Failed to create indexes:', error)
  }
}

createIndexes().catch(console.error)