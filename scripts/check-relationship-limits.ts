#!/usr/bin/env npx tsx
import neo4j from 'neo4j-driver'

const NEO4J_URI = 'neo4j+s://eb61aceb.databases.neo4j.io'
const NEO4J_USER = 'neo4j'
const NEO4J_PASSWORD = 'XROfdG-0_Idz6zzm6s1C5Bwao6GgW_84T7BeT_uvtW8'

async function main() {
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
  )
  
  const session = driver.session()
  
  try {
    console.log('=== Checking Relationship Limits ===\n')
    
    // 1. Check entities with the most relationships
    console.log('1. Entities with most RELATES_TO relationships:\n')
    
    // Check memories
    console.log('Memories:')
    const memoryResult = await session.run(`
      MATCH (m:Memory)
      WITH m, COUNT { (m)-[:RELATES_TO]-() } as relCount
      WHERE relCount > 0
      RETURN m.id as id, m.content as content, relCount
      ORDER BY relCount DESC
      LIMIT 10
    `)
    
    for (const record of memoryResult.records) {
      const count = record.get('relCount').toNumber()
      const content = record.get('content')?.substring(0, 50) + '...'
      console.log(`  ${count} relationships: ${content}`)
    }
    
    // Check code entities
    console.log('\nCode Entities:')
    const codeResult = await session.run(`
      MATCH (c:CodeEntity)
      WITH c, COUNT { (c)-[:RELATES_TO]-() } as relCount
      WHERE relCount > 0
      RETURN c.id as id, c.name as name, c.path as path, relCount
      ORDER BY relCount DESC
      LIMIT 10
    `)
    
    for (const record of codeResult.records) {
      const count = record.get('relCount').toNumber()
      const name = record.get('name')
      console.log(`  ${count} relationships: ${name}`)
    }
    
    // 2. Check if any entity exceeds 25 relationships
    console.log('\n2. Entities exceeding 25 relationship limit:\n')
    
    const violationsResult = await session.run(`
      MATCH (n)
      WHERE (n:Memory OR n:CodeEntity)
      WITH n, COUNT { (n)-[:RELATES_TO]-() } as relCount
      WHERE relCount > 25
      RETURN labels(n)[0] as type, n.id as id, 
             CASE 
               WHEN n:Memory THEN n.content
               ELSE n.name
             END as identifier,
             relCount
      ORDER BY relCount DESC
    `)
    
    if (violationsResult.records.length === 0) {
      console.log('✅ No entities exceed the 25 relationship limit')
    } else {
      console.log(`❌ Found ${violationsResult.records.length} entities exceeding limit:`)
      for (const record of violationsResult.records) {
        const type = record.get('type')
        const count = record.get('relCount').toNumber()
        const identifier = record.get('identifier')?.substring(0, 50) + '...'
        console.log(`  ${type}: ${count} relationships - ${identifier}`)
      }
    }
    
    // 3. Distribution of relationship counts
    console.log('\n3. Distribution of relationship counts:\n')
    
    const distributionResult = await session.run(`
      MATCH (n)
      WHERE (n:Memory OR n:CodeEntity)
      WITH n, COUNT { (n)-[:RELATES_TO]-() } as relCount
      WHERE relCount > 0
      RETURN 
        CASE 
          WHEN relCount <= 5 THEN '1-5'
          WHEN relCount <= 10 THEN '6-10'
          WHEN relCount <= 15 THEN '11-15'
          WHEN relCount <= 20 THEN '16-20'
          WHEN relCount <= 25 THEN '21-25'
          ELSE '26+'
        END as range,
        count(n) as count
      ORDER BY range
    `)
    
    console.log('Relationship count distribution:')
    for (const record of distributionResult.records) {
      const range = record.get('range')
      const count = record.get('count').toNumber()
      console.log(`  ${range} relationships: ${count} entities`)
    }
    
    // 4. Check total relationships
    console.log('\n4. Total RELATES_TO relationships:')
    
    const totalResult = await session.run(`
      MATCH ()-[r:RELATES_TO]-()
      RETURN count(r) as total,
             avg(r.similarity) as avgSimilarity,
             collect(DISTINCT r.detection_method) as methods
    `)
    
    const total = totalResult.records[0].get('total').toNumber()
    const avgSim = totalResult.records[0].get('avgSimilarity')
    const methods = totalResult.records[0].get('methods')
    
    console.log(`  Total: ${total}`)
    console.log(`  Average similarity: ${avgSim?.toFixed(3)}`)
    console.log(`  Detection methods: ${methods.join(', ')}`)
    
  } finally {
    await session.close()
    await driver.close()
  }
}

main().catch(console.error)