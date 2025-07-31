#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

async function checkNeo4jContent() {
  console.log('=== CHECKING NEO4J CONTENT ===\n')
  
  const driver = neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
  )
  
  const session = driver.session()
  
  try {
    // 1. Count all node types
    console.log('📊 NODE COUNTS BY LABEL:')
    const nodeCountResult = await session.run(`
      MATCH (n)
      UNWIND labels(n) as label
      RETURN label, count(n) as count
      ORDER BY count DESC
    `)
    
    for (const record of nodeCountResult.records) {
      const label = record.get('label')
      const count = record.get('count').toInt()
      console.log(`  ${label}: ${count}`)
    }
    
    // 2. Check for Memory nodes specifically
    console.log('\n🧠 MEMORY NODES:')
    const memoryResult = await session.run(`
      MATCH (m:Memory)
      RETURN count(m) as count
    `)
    const memoryCount = memoryResult.records[0]?.get('count').toInt() || 0
    console.log(`  Total Memory nodes: ${memoryCount}`)
    
    // 3. Check for EntitySummary nodes
    console.log('\n📝 ENTITY SUMMARY NODES:')
    const summaryResult = await session.run(`
      MATCH (s:EntitySummary)
      RETURN count(s) as count
    `)
    const summaryCount = summaryResult.records[0]?.get('count').toInt() || 0
    console.log(`  Total EntitySummary nodes: ${summaryCount}`)
    
    // 4. Check relationships
    console.log('\n🔗 RELATIONSHIP COUNTS:')
    const relResult = await session.run(`
      MATCH ()-[r]->()
      RETURN type(r) as type, count(r) as count
      ORDER BY count DESC
      LIMIT 10
    `)
    
    if (relResult.records.length === 0) {
      console.log('  No relationships found!')
    } else {
      for (const record of relResult.records) {
        const type = record.get('type')
        const count = record.get('count').toInt()
        console.log(`  ${type}: ${count}`)
      }
    }
    
    // 5. Check a sample node
    console.log('\n🔍 SAMPLE NODE:')
    const sampleResult = await session.run(`
      MATCH (n)
      RETURN n, labels(n) as labels
      LIMIT 1
    `)
    
    if (sampleResult.records.length > 0) {
      const node = sampleResult.records[0].get('n')
      const labels = sampleResult.records[0].get('labels')
      console.log(`  Labels: ${labels.join(', ')}`)
      console.log(`  Properties: ${JSON.stringify(node.properties, null, 2)}`)
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

checkNeo4jContent().catch(console.error)