import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import neo4j from 'neo4j-driver'

// Load environment variables
config({ path: '.env.local' })

async function testDirectNeo4jIngestion() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  const driver = neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
  )

  try {
    const session = driver.session()
    
    console.log('=== TESTING DIRECT NEO4J INGESTION ===\n')
    
    // Get a sample code entity from Supabase
    const { data: sampleEntity } = await supabase
      .from('code_entities')
      .select('*')
      .eq('file_path', 'SUBSTACK_POST.md')
      .eq('project_name', 'camille')
      .single()
    
    if (!sampleEntity) {
      console.error('Could not find sample entity')
      return
    }
    
    console.log('Sample entity from Supabase:')
    console.log('ID:', sampleEntity.id)
    console.log('Name:', sampleEntity.name)
    console.log('Path:', sampleEntity.file_path)
    
    // Test what happens when we pass the entity directly
    console.log('\n=== TESTING MERGE WITH ACTUAL DATA ===')
    
    // First, let's see what happens with undefined ID
    console.log('\nTest 1: MERGE with undefined ID')
    const undefinedEntity = { ...sampleEntity }
    delete undefinedEntity.id  // Make ID undefined
    
    try {
      const result1 = await session.run(`
        MERGE (test:TestCodeEntity {
          id: $id,
          workspace_id: $workspace_id
        })
        SET test.name = $name,
            test.path = $path
        RETURN test.id as id
      `, {
        id: undefinedEntity.id,  // This is undefined!
        workspace_id: 'user:test',
        name: 'Test 1',
        path: 'test1.js'
      })
      
      const createdId = result1.records[0]?.get('id')
      console.log('Created node with ID:', createdId)
      console.log('Type of ID:', typeof createdId)
    } catch (error) {
      console.log('Error:', error.message)
    }
    
    // Test 2: Another undefined ID
    console.log('\nTest 2: MERGE another node with undefined ID')
    try {
      const result2 = await session.run(`
        MERGE (test:TestCodeEntity {
          id: $id,
          workspace_id: $workspace_id
        })
        SET test.name = $name,
            test.path = $path
        RETURN test.id as id, test.name as name
      `, {
        id: undefined,
        workspace_id: 'user:test',
        name: 'Test 2',
        path: 'test2.js'
      })
      
      const createdId = result2.records[0]?.get('id')
      const name = result2.records[0]?.get('name')
      console.log('Created node with ID:', createdId)
      console.log('Name:', name)
    } catch (error) {
      console.log('Error:', error.message)
    }
    
    // Count test nodes
    const countResult = await session.run('MATCH (t:TestCodeEntity) RETURN COUNT(t) as count')
    const count = countResult.records[0].get('count').toNumber()
    console.log(`\nTotal TestCodeEntity nodes: ${count}`)
    
    if (count === 1) {
      console.log('⚠️  CONFIRMED: Undefined IDs cause all nodes to merge!')
      
      // Get the merged node details
      const mergedResult = await session.run('MATCH (t:TestCodeEntity) RETURN t')
      const mergedNode = mergedResult.records[0]?.get('t')
      console.log('\nMerged node properties:')
      console.log('ID:', mergedNode.properties.id)
      console.log('Name:', mergedNode.properties.name)
      console.log('Path:', mergedNode.properties.path)
    }
    
    // Clean up
    await session.run('MATCH (t:TestCodeEntity) DELETE t')
    
    await session.close()
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await driver.close()
  }
}

testDirectNeo4jIngestion().catch(console.error)