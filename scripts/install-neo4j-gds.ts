#!/usr/bin/env npx tsx

/**
 * Install Neo4j Graph Data Science (GDS) library
 */

import * as dotenv from 'dotenv'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

async function installGDS() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
  )
  
  try {
    const session = driver.session()
    
    console.log('\n=== Installing Neo4j GDS ===')
    
    // Check if GDS is already installed
    try {
      const versionCheck = await session.run('CALL gds.version()')
      const version = versionCheck.records[0].get(0)
      console.log(`GDS is already installed. Version: ${version}`)
      
      // List available procedures
      const procedures = await session.run(`
        CALL gds.list() YIELD name
        RETURN collect(name) as procedures
      `)
      console.log('\nAvailable GDS procedures:', procedures.records[0].get('procedures').slice(0, 10), '...')
      
    } catch (error) {
      console.log('GDS not installed. For Neo4j Aura, GDS should be pre-installed.')
      console.log('\nTo install GDS on self-hosted Neo4j:')
      console.log('1. Download GDS from: https://neo4j.com/download-center/#gds')
      console.log('2. Copy the JAR file to your Neo4j plugins directory')
      console.log('3. Add to neo4j.conf: dbms.security.procedures.unrestricted=gds.*')
      console.log('4. Restart Neo4j')
      
      // Check if we have similarity functions available
      console.log('\nChecking for vector similarity functions...')
      try {
        const functions = await session.run(`
          SHOW FUNCTIONS YIELD name
          WHERE name CONTAINS 'similarity' OR name CONTAINS 'vector' OR name CONTAINS 'cosine'
          RETURN collect(name) as functions
        `)
        console.log('Available similarity functions:', functions.records[0].get('functions'))
      } catch (e) {
        console.log('Could not list functions:', e.message)
      }
    }
    
    // Create vector indexes if not exists
    console.log('\n=== Creating Vector Indexes ===')
    
    // Check existing indexes
    const indexes = await session.run(`
      SHOW INDEXES
      YIELD name, type, labelsOrTypes, properties
      WHERE type CONTAINS 'VECTOR'
      RETURN name, type, labelsOrTypes, properties
    `)
    
    console.log('\nExisting vector indexes:')
    indexes.records.forEach(record => {
      console.log(`  ${record.get('name')}: ${record.get('labelsOrTypes')} on ${record.get('properties')}`)
    })
    
    // Create vector index for EntitySummary if not exists
    try {
      await session.run(`
        CREATE VECTOR INDEX entity_embedding_index IF NOT EXISTS
        FOR (n:EntitySummary)
        ON (n.embedding)
        OPTIONS {
          indexConfig: {
            \`vector.dimensions\`: 3072,
            \`vector.similarity_function\`: 'cosine'
          }
        }
      `)
      console.log('Created entity_embedding_index')
    } catch (e) {
      console.log('entity_embedding_index already exists or failed:', e.message)
    }
    
    // Create vector index for Memory if not exists
    try {
      await session.run(`
        CREATE VECTOR INDEX memory_embedding_index IF NOT EXISTS
        FOR (n:Memory)
        ON (n.embedding)
        OPTIONS {
          indexConfig: {
            \`vector.dimensions\`: 3072,
            \`vector.similarity_function\`: 'cosine'
          }
        }
      `)
      console.log('Created memory_embedding_index')
    } catch (e) {
      console.log('memory_embedding_index already exists or failed:', e.message)
    }
    
    // Create vector index for CodeEntity if not exists
    try {
      await session.run(`
        CREATE VECTOR INDEX code_embedding_index IF NOT EXISTS
        FOR (n:CodeEntity)
        ON (n.embedding)
        OPTIONS {
          indexConfig: {
            \`vector.dimensions\`: 3072,
            \`vector.similarity_function\`: 'cosine'
          }
        }
      `)
      console.log('Created code_embedding_index')
    } catch (e) {
      console.log('code_embedding_index already exists or failed:', e.message)
    }
    
    await session.close()
  } finally {
    await driver.close()
  }
}

installGDS().catch(console.error)