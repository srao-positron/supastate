import neo4j from 'neo4j-driver'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

async function deleteAllNeo4jData() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI || 'neo4j+s://eb61aceb.databases.neo4j.io',
    neo4j.auth.basic(
      process.env.NEO4J_USER || 'neo4j',
      process.env.NEO4J_PASSWORD!
    )
  )

  const session = driver.session()

  try {
    console.log('🗑️  Deleting all data from Neo4j...\n')

    // First, get counts of what we're about to delete
    const countResult = await session.run(`
      MATCH (n)
      WITH labels(n) as nodeLabels, count(n) as nodeCount
      RETURN nodeLabels, nodeCount
      ORDER BY nodeCount DESC
    `)

    console.log('Current data in Neo4j:')
    let totalNodes = 0
    countResult.records.forEach(record => {
      const labels = record.get('nodeLabels')
      const count = record.get('nodeCount').toNumber()
      totalNodes += count
      console.log(`  ${labels.join(':')} nodes: ${count}`)
    })
    console.log(`  Total nodes: ${totalNodes}\n`)

    if (totalNodes === 0) {
      console.log('✅ No data to delete')
      return
    }

    // Confirm deletion
    console.log('⚠️  WARNING: This will delete ALL data from Neo4j!')
    console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...\n')
    await new Promise(resolve => setTimeout(resolve, 5000))

    // Delete all relationships first
    console.log('Deleting all relationships...')
    const relResult = await session.run(`
      MATCH ()-[r]->()
      WITH count(r) as totalRels
      CALL apoc.periodic.iterate(
        "MATCH ()-[r]->() RETURN r",
        "DELETE r",
        {batchSize: 10000}
      )
      YIELD batches, total
      RETURN batches, total, totalRels
    `)
    
    if (relResult.records.length > 0) {
      const record = relResult.records[0]
      console.log(`  Deleted ${record.get('total').toNumber()} relationships in ${record.get('batches').toNumber()} batches`)
    }

    // Delete all nodes
    console.log('\nDeleting all nodes...')
    const nodeResult = await session.run(`
      CALL apoc.periodic.iterate(
        "MATCH (n) RETURN n",
        "DETACH DELETE n",
        {batchSize: 10000}
      )
      YIELD batches, total
      RETURN batches, total
    `)

    if (nodeResult.records.length > 0) {
      const record = nodeResult.records[0]
      console.log(`  Deleted ${record.get('total').toNumber()} nodes in ${record.get('batches').toNumber()} batches`)
    }

    // Verify deletion
    console.log('\nVerifying deletion...')
    const verifyResult = await session.run(`
      MATCH (n)
      RETURN count(n) as remainingNodes
    `)

    const remaining = verifyResult.records[0].get('remainingNodes').toNumber()
    if (remaining === 0) {
      console.log('✅ All data successfully deleted from Neo4j')
    } else {
      console.log(`⚠️  ${remaining} nodes still remain`)
    }

  } catch (error) {
    console.error('Error deleting Neo4j data:', error)
    
    // If APOC is not available, use simple delete
    if (error instanceof Error && error.message?.includes('apoc')) {
      console.log('\nAPOC not available, using simple delete...')
      
      try {
        // Delete in smaller batches without APOC
        let deleted = 0
        let hasMore = true
        
        while (hasMore) {
          const result = await session.run(`
            MATCH (n)
            WITH n LIMIT 1000
            DETACH DELETE n
            RETURN count(n) as deleted
          `)
          
          const batchDeleted = result.records[0].get('deleted').toNumber()
          deleted += batchDeleted
          hasMore = batchDeleted === 1000
          
          if (hasMore) {
            console.log(`  Deleted ${deleted} nodes so far...`)
          }
        }
        
        console.log(`✅ Deleted ${deleted} nodes total`)
      } catch (simpleError) {
        console.error('Error with simple delete:', simpleError)
      }
    }
  } finally {
    await session.close()
    await driver.close()
  }
}

deleteAllNeo4jData().then(() => {
  console.log('\nDone!')
  process.exit(0)
}).catch(err => {
  console.error('Error:', err)
  process.exit(1)
})