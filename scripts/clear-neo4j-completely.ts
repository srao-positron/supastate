#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

async function clearNeo4jCompletely() {
  console.log('=== CLEARING NEO4J COMPLETELY ===\n')
  
  const driver = neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
  )
  
  const session = driver.session()
  
  try {
    // First, count all nodes
    const countResult = await session.run(`
      MATCH (n)
      RETURN count(n) as totalNodes, labels(n) as nodeLabels
    `)
    
    const totalNodes = countResult.records[0]?.get('totalNodes').toInt() || 0
    console.log(`Total nodes found: ${totalNodes}`)
    
    if (totalNodes > 0) {
      // Get counts by label
      const labelCountResult = await session.run(`
        MATCH (n)
        UNWIND labels(n) as label
        RETURN label, count(n) as count
        ORDER BY count DESC
      `)
      
      console.log('\nNodes by label:')
      for (const record of labelCountResult.records) {
        const label = record.get('label')
        const count = record.get('count').toInt()
        console.log(`  - ${label}: ${count}`)
      }
      
      // Delete everything
      console.log('\nDeleting all nodes and relationships...')
      const deleteResult = await session.run(`
        MATCH (n)
        DETACH DELETE n
        RETURN count(n) as deletedCount
      `)
      
      const deletedCount = deleteResult.records[0]?.get('deletedCount').toInt() || 0
      console.log(`✅ Deleted ${deletedCount} nodes and all relationships`)
      
      // Verify deletion
      const verifyResult = await session.run(`
        MATCH (n)
        RETURN count(n) as remainingNodes
      `)
      
      const remainingNodes = verifyResult.records[0]?.get('remainingNodes').toInt() || 0
      
      if (remainingNodes === 0) {
        console.log('\n✅ Neo4j is now completely empty!')
      } else {
        console.log(`\n⚠️  WARNING: ${remainingNodes} nodes still remain!`)
        
        // Try more aggressive deletion
        console.log('\nAttempting more aggressive deletion...')
        await session.run(`MATCH (n) DETACH DELETE n`)
        
        const finalCheck = await session.run(`MATCH (n) RETURN count(n) as finalCount`)
        const finalCount = finalCheck.records[0]?.get('finalCount').toInt() || 0
        
        if (finalCount === 0) {
          console.log('✅ Neo4j is now completely empty after second attempt!')
        } else {
          console.log(`❌ Still ${finalCount} nodes remaining. Manual intervention may be required.`)
        }
      }
    } else {
      console.log('✅ Neo4j is already empty!')
    }
    
    // Show indexes
    console.log('\nChecking indexes...')
    const indexResult = await session.run(`SHOW INDEXES`)
    
    const indexCount = indexResult.records.length
    console.log(`Found ${indexCount} indexes`)
    
    if (indexCount > 0) {
      console.log('\nIndexes will be automatically recreated when new data is ingested.')
    }
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await session.close()
    await driver.close()
  }
}

clearNeo4jCompletely().catch(console.error)