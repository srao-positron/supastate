import neo4j from 'neo4j-driver'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
)

async function clearNeo4jInBatches() {
  const session = driver.session()
  
  try {
    console.log('=== CLEARING NEO4J IN BATCHES ===\n')
    
    // Delete in order of dependencies
    const nodeTypes = [
      'Pattern',
      'EntitySummary',
      'Memory',
      'CodeEntity',
      'Project',
      'User'
    ]
    
    for (const nodeType of nodeTypes) {
      console.log(`Deleting ${nodeType} nodes...`)
      
      let deleted = 0
      let batchDeleted = 0
      
      do {
        // Delete in small batches to avoid memory issues
        const result = await session.run(`
          MATCH (n:${nodeType})
          WITH n LIMIT 100
          DETACH DELETE n
          RETURN count(n) as deleted
        `)
        
        batchDeleted = result.records[0].get('deleted').toNumber()
        deleted += batchDeleted
        
        if (batchDeleted > 0) {
          process.stdout.write(`  Deleted ${deleted} ${nodeType} nodes...\r`)
        }
      } while (batchDeleted > 0)
      
      if (deleted > 0) {
        console.log(`  ✓ Deleted ${deleted} ${nodeType} nodes`)
      }
    }
    
    // Final check
    const countResult = await session.run('MATCH (n) RETURN count(n) as count')
    const remaining = countResult.records[0].get('count').toNumber()
    
    if (remaining === 0) {
      console.log('\n✅ Neo4j is now completely empty!')
    } else {
      console.log(`\n⚠️  Warning: ${remaining} nodes still remain`)
    }
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await session.close()
    await driver.close()
  }
}

clearNeo4jInBatches().catch(console.error)