import { config } from 'dotenv'
config({ path: '.env.local' })

import { neo4jService } from '../src/lib/neo4j/service'
import { closeDriver } from '../src/lib/neo4j/client'

async function truncateNeo4j() {
  console.log('🗑️  Truncating Neo4j database...\n')
  
  try {
    await neo4jService.initialize()
    
    // Delete all nodes and relationships
    console.log('Deleting all nodes and relationships...')
    await neo4jService.executeQuery(`
      MATCH (n)
      DETACH DELETE n
    `)
    
    // Verify deletion
    const countResult = await neo4jService.executeQuery(`
      MATCH (n)
      RETURN count(n) as nodeCount
    `)
    
    const relationshipResult = await neo4jService.executeQuery(`
      MATCH ()-[r]->()
      RETURN count(r) as relCount
    `)
    
    console.log('✅ Database truncated successfully!')
    console.log(`   Remaining nodes: ${countResult.records[0].nodeCount}`)
    console.log(`   Remaining relationships: ${relationshipResult.records[0].relCount}`)
    
  } catch (error) {
    console.error('❌ Failed to truncate database:', error)
  } finally {
    await closeDriver()
  }
}

// Add confirmation prompt
console.log('⚠️  WARNING: This will delete ALL data in Neo4j!')
console.log('Press Ctrl+C to cancel, or wait 3 seconds to continue...\n')

setTimeout(() => {
  truncateNeo4j()
}, 3000)