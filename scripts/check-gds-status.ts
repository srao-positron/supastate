#!/usr/bin/env npx tsx

/**
 * Check if Neo4j GDS is installed and working
 */

import * as dotenv from 'dotenv'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
)

async function checkGDSStatus() {
  const session = driver.session()
  
  try {
    console.log('=== Checking Neo4j GDS Status ===\n')
    
    // 1. Check if GDS functions exist
    try {
      const version = await session.run(`
        RETURN gds.version() as version
      `)
      console.log(`✅ GDS Version: ${version.records[0].get('version')}`)
    } catch (e) {
      console.log('❌ GDS not installed or not accessible')
      console.log(`Error: ${e.message}`)
      return
    }
    
    // 2. Test simple cosine similarity
    console.log('\nTesting cosine similarity with simple vectors...')
    try {
      const result = await session.run(`
        WITH [1.0, 0.0, 0.0] as v1, [0.0, 1.0, 0.0] as v2
        RETURN gds.similarity.cosine(v1, v2) as similarity
      `)
      console.log(`✅ Cosine similarity test: ${result.records[0].get('similarity')}`)
    } catch (e) {
      console.log('❌ Cosine similarity failed')
      console.log(`Error: ${e.message}`)
    }
    
    // 3. Check if we're in Aura (which doesn't support GDS)
    console.log('\nChecking database edition...')
    try {
      const dbInfo = await session.run(`
        CALL dbms.components() YIELD name, versions, edition
        WHERE name = 'Neo4j Kernel'
        RETURN edition, versions[0] as version
      `)
      const edition = dbInfo.records[0]?.get('edition')
      const version = dbInfo.records[0]?.get('version')
      console.log(`Database: ${edition} ${version}`)
      
      if (edition && edition.includes('aura')) {
        console.log('\n⚠️  WARNING: Neo4j Aura does not support GDS!')
        console.log('Semantic similarity functions will not work.')
      }
    } catch (e) {
      console.log('Could not determine database edition')
    }
    
    // 4. Try alternative similarity calculation
    console.log('\nTesting alternative similarity calculation...')
    try {
      const altResult = await session.run(`
        WITH [1.0, 0.0, 0.0] as v1, [0.0, 1.0, 0.0] as v2
        WITH v1, v2, 
             reduce(dot = 0.0, i IN range(0, size(v1)-1) | dot + v1[i] * v2[i]) as dotProduct,
             sqrt(reduce(sum = 0.0, val IN v1 | sum + val * val)) as norm1,
             sqrt(reduce(sum = 0.0, val IN v2 | sum + val * val)) as norm2
        RETURN CASE 
          WHEN norm1 = 0 OR norm2 = 0 THEN 0 
          ELSE dotProduct / (norm1 * norm2) 
        END as similarity
      `)
      console.log(`✅ Alternative cosine similarity: ${altResult.records[0].get('similarity')}`)
    } catch (e) {
      console.log('❌ Alternative calculation failed')
      console.log(`Error: ${e.message}`)
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

checkGDSStatus().catch(console.error)