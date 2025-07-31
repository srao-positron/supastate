import { config } from 'dotenv'
import neo4j from 'neo4j-driver'

// Load environment variables
config({ path: '.env.local' })

async function debugCodeEntityMerging() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
  )

  try {
    const session = driver.session()
    
    console.log('=== DEBUGGING CODE ENTITY MERGING ISSUE ===\n')
    
    // 1. Get the single CodeEntity that exists
    const singleEntityResult = await session.run(`
      MATCH (c:CodeEntity)
      RETURN c
      LIMIT 1
    `)
    
    const entity = singleEntityResult.records[0]?.get('c')
    if (entity) {
      console.log('Single CodeEntity found:')
      console.log('ID:', entity.properties.id)
      console.log('Name:', entity.properties.name)
      console.log('Path:', entity.properties.path)
      console.log('Type:', entity.properties.type)
      console.log('Project:', entity.properties.project_name)
      console.log('Workspace:', entity.properties.workspace_id)
      console.log('User:', entity.properties.user_id)
      console.log('Created:', entity.properties.created_at)
      console.log('Updated:', entity.properties.updated_at)
    }
    
    // 2. Check code_entities table in Supabase to see what IDs were generated
    console.log('\n=== CHECKING SUPABASE CODE_ENTITIES TABLE ===')
    console.log('Run this SQL in Supabase Dashboard SQL Editor:')
    console.log(`
SELECT 
  id,
  file_path,
  name,
  project_name,
  created_at,
  updated_at
FROM code_entities
WHERE user_id = 'a02c3fed-3a24-442f-becc-97bac8b75e90'
  AND project_name = 'camille'
ORDER BY created_at DESC
LIMIT 20;
    `)
    
    // 3. Check if all CodeEntity nodes were merged due to same properties
    console.log('\n=== ANALYZING MERGE BEHAVIOR ===')
    
    // The issue is likely that all entities are being merged because they have:
    // - Same ID (if IDs are being reused somehow)
    // - Same workspace_id
    
    // Let's check the Neo4j transaction history
    const historyResult = await session.run(`
      CALL dbms.listTransactions()
      YIELD transactionId, username, metaData, startTime, status, elapsedTime
      WHERE metaData CONTAINS 'CodeEntity'
      RETURN transactionId, username, metaData, startTime, status, elapsedTime
      LIMIT 10
    `).catch(() => null)
    
    if (historyResult) {
      console.log('\nRecent transactions involving CodeEntity:')
      historyResult.records.forEach(record => {
        console.log('Transaction:', record.toObject())
      })
    }
    
    // 4. Check if there are any orphaned properties
    console.log('\n=== CHECKING FOR DATA LOSS ===')
    const propertiesResult = await session.run(`
      MATCH (c:CodeEntity)
      UNWIND keys(c) as key
      RETURN DISTINCT key
      ORDER BY key
    `)
    
    console.log('\nAll properties on the CodeEntity node:')
    propertiesResult.records.forEach(record => {
      console.log(`- ${record.get('key')}`)
    })
    
    // 5. Check relationships
    const relationshipsResult = await session.run(`
      MATCH (c:CodeEntity)-[r]-()
      RETURN type(r) as relType, count(r) as count
      ORDER BY count DESC
    `)
    
    console.log('\nRelationships:')
    relationshipsResult.records.forEach(record => {
      console.log(`- ${record.get('relType')}: ${record.get('count')}`)
    })
    
    // 6. The real issue: Check if we're using wrong MERGE keys
    console.log('\n=== HYPOTHESIS: MERGE IS USING WRONG KEYS ===')
    console.log('\nThe MERGE statement in ingest-code-to-neo4j uses:')
    console.log('MERGE (c:CodeEntity { id: $id, workspace_id: $workspace_id })')
    console.log('\nBut it should probably just use:')
    console.log('MERGE (c:CodeEntity { id: $id })')
    console.log('\nBecause the ID is already unique across all entities.')
    
    await session.close()
  } catch (error) {
    console.error('Error debugging:', error)
  } finally {
    await driver.close()
  }
}

debugCodeEntityMerging().catch(console.error)