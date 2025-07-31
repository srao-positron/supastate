import { config } from 'dotenv'
import neo4j from 'neo4j-driver'

// Load environment variables
config({ path: '.env.local' })

async function testNeo4jMergeBehavior() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
  )

  try {
    const session = driver.session()
    
    console.log('=== TESTING NEO4J MERGE BEHAVIOR ===\n')
    
    // First, let's create a test scenario
    console.log('Creating test nodes to understand the merge behavior...\n')
    
    // Test 1: What happens if we MERGE with undefined ID?
    console.log('Test 1: MERGE with undefined/null ID')
    try {
      await session.run(`
        MERGE (t:TestNode {
          id: $id,
          workspace_id: $workspace_id
        })
        SET t.name = $name
        RETURN t
      `, {
        id: undefined,  // This might be the issue!
        workspace_id: 'test-workspace',
        name: 'Test 1'
      })
      console.log('✓ Created node with undefined ID')
    } catch (error) {
      console.log('✗ Error with undefined ID:', error.message)
    }
    
    // Test 2: MERGE another node with undefined ID
    console.log('\nTest 2: MERGE another node with undefined ID')
    try {
      await session.run(`
        MERGE (t:TestNode {
          id: $id,
          workspace_id: $workspace_id
        })
        SET t.name = $name
        RETURN t
      `, {
        id: undefined,
        workspace_id: 'test-workspace',
        name: 'Test 2'
      })
      console.log('✓ Created second node with undefined ID')
    } catch (error) {
      console.log('✗ Error with second undefined ID:', error.message)
    }
    
    // Check how many TestNode nodes we have
    const countResult = await session.run('MATCH (t:TestNode) RETURN COUNT(t) as count')
    const count = countResult.records[0].get('count').toNumber()
    console.log(`\nTotal TestNode count: ${count}`)
    
    if (count === 1) {
      console.log('⚠️  Both nodes merged into one! This confirms the bug.')
    }
    
    // Clean up test nodes
    await session.run('MATCH (t:TestNode) DELETE t')
    
    // Now let's check what's in the actual CodeEntity
    console.log('\n=== ANALYZING ACTUAL CODE ENTITY ===')
    const codeEntityResult = await session.run(`
      MATCH (c:CodeEntity)
      RETURN c.id as id, c.workspace_id as workspace_id, c.name as name
      LIMIT 1
    `)
    
    const record = codeEntityResult.records[0]
    if (record) {
      const id = record.get('id')
      const workspace = record.get('workspace_id')
      const name = record.get('name')
      
      console.log(`ID: ${id}`)
      console.log(`Workspace: ${workspace}`)
      console.log(`Name: ${name}`)
      
      // Check if this ID exists in any logs or if it's a generated ID
      if (id === 'c58846a3-da47-42e1-a206-cd2a9cdd5b44') {
        console.log('\nThis ID looks like a UUID but doesn\'t exist in Supabase.')
        console.log('It might have been generated during ingestion if the entity.id was undefined.')
      }
    }
    
    await session.close()
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await driver.close()
  }
}

testNeo4jMergeBehavior().catch(console.error)