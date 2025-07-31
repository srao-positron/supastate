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
    console.log('=== Checking for Duplicate EntitySummary Nodes ===\n')
    
    // Find duplicate EntitySummary nodes by entity_id
    const duplicates = await session.run(`
      MATCH (e:EntitySummary)
      WITH e.entity_id as entityId, collect(e) as summaries, count(e) as count
      WHERE count > 1
      RETURN entityId, count, 
             [s IN summaries | {
               id: s.id,
               created_at: s.created_at,
               entity_type: s.entity_type,
               project: s.project_name
             }] as summaryDetails
      ORDER BY count DESC
      LIMIT 10
    `)
    
    if (duplicates.records.length === 0) {
      console.log('No duplicate EntitySummary nodes found by entity_id')
    } else {
      console.log(`Found ${duplicates.records.length} entities with duplicate summaries:\n`)
      
      for (const record of duplicates.records) {
        const entityId = record.get('entityId')
        const count = record.get('count').toNumber()
        const details = record.get('summaryDetails')
        
        console.log(`Entity ID: ${entityId}`)
        console.log(`  Duplicate count: ${count}`)
        console.log('  Summaries:')
        for (const summary of details) {
          console.log(`    - ID: ${summary.id}`)
          console.log(`      Created: ${new Date(summary.created_at).toLocaleString()}`)
          console.log(`      Type: ${summary.entity_type}`)
          console.log(`      Project: ${summary.project}`)
        }
        console.log()
      }
    }
    
    // Check specific code file example
    console.log('\n=== Checking test-unified-search.js Specifically ===\n')
    
    const testFile = await session.run(`
      MATCH (c:CodeEntity {name: 'test-unified-search.js'})
      OPTIONAL MATCH (c)<-[:SUMMARIZES]-(s:EntitySummary)
      RETURN c.id as codeId, c.file_path as path, 
             collect({
               id: s.id,
               entity_id: s.entity_id,
               created_at: s.created_at
             }) as summaries
    `)
    
    if (testFile.records.length > 0) {
      for (const record of testFile.records) {
        const codeId = record.get('codeId')
        const path = record.get('path')
        const summaries = record.get('summaries').filter(s => s.id !== null)
        
        console.log(`Code Entity: ${path}`)
        console.log(`  ID: ${codeId}`)
        console.log(`  EntitySummary count: ${summaries.length}`)
        if (summaries.length > 0) {
          console.log('  Summaries:')
          for (const summary of summaries) {
            console.log(`    - Summary ID: ${summary.id}`)
            console.log(`      Entity ID ref: ${summary.entity_id}`)
            console.log(`      Created: ${new Date(summary.created_at).toLocaleString()}`)
          }
        }
        console.log()
      }
    }
    
    // Check how processCodeEntities works
    console.log('\n=== Pattern of EntitySummary Creation ===\n')
    
    const pattern = await session.run(`
      MATCH (s:EntitySummary {entity_type: 'code'})
      WITH date(s.created_at) as day, 
           datetime({epochMillis: toInteger(s.created_at.epochMillis / 60000) * 60000}) as minute,
           count(s) as count
      RETURN day, minute, count
      ORDER BY minute DESC
      LIMIT 20
    `)
    
    console.log('EntitySummary creation pattern (by minute):')
    for (const record of pattern.records) {
      const minute = record.get('minute')
      const count = record.get('count').toNumber()
      console.log(`  ${new Date(minute).toLocaleString()}: ${count} summaries created`)
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

main().catch(console.error)