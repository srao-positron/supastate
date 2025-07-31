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
    console.log('=== Checking for Duplicate Nodes in Neo4j ===\n')
    
    // 1. Check for duplicate Memory nodes by id
    console.log('1. Checking for duplicate Memory nodes by id:')
    const duplicateMemories = await session.run(`
      MATCH (m:Memory)
      WITH m.id as memoryId, collect(m) as memories, count(m) as count
      WHERE count > 1
      RETURN memoryId, count, 
             [mem IN memories | {
               created_at: mem.created_at,
               occurred_date: mem.occurred_date,
               user_id: mem.user_id,
               workspace_id: mem.workspace_id,
               project_name: mem.project_name
             }] as memoryDetails
      ORDER BY count DESC
      LIMIT 10
    `)
    
    if (duplicateMemories.records.length === 0) {
      console.log('  ✓ No duplicate Memory nodes found')
    } else {
      console.log(`  ✗ Found ${duplicateMemories.records.length} Memory IDs with duplicates:`)
      for (const record of duplicateMemories.records) {
        const memoryId = record.get('memoryId')
        const count = record.get('count').toNumber()
        console.log(`\n  Memory ID: ${memoryId} (${count} duplicates)`)
        const details = record.get('memoryDetails')
        for (let i = 0; i < details.length; i++) {
          console.log(`    Instance ${i + 1}:`)
          console.log(`      Created: ${new Date(details[i].created_at).toLocaleString()}`)
          console.log(`      User ID: ${details[i].user_id}`)
          console.log(`      Workspace ID: ${details[i].workspace_id}`)
          console.log(`      Project: ${details[i].project_name}`)
        }
      }
    }
    
    // 2. Check for duplicate CodeEntity nodes by id
    console.log('\n\n2. Checking for duplicate CodeEntity nodes by id:')
    const duplicateCode = await session.run(`
      MATCH (c:CodeEntity)
      WITH c.id as codeId, collect(c) as entities, count(c) as count
      WHERE count > 1
      RETURN codeId, count, 
             [e IN entities | {
               name: e.name,
               file_path: e.file_path,
               created_at: e.created_at,
               user_id: e.user_id,
               workspace_id: e.workspace_id,
               project_name: e.project_name
             }] as entityDetails
      ORDER BY count DESC
      LIMIT 10
    `)
    
    if (duplicateCode.records.length === 0) {
      console.log('  ✓ No duplicate CodeEntity nodes found')
    } else {
      console.log(`  ✗ Found ${duplicateCode.records.length} CodeEntity IDs with duplicates:`)
      for (const record of duplicateCode.records) {
        const codeId = record.get('codeId')
        const count = record.get('count').toNumber()
        console.log(`\n  CodeEntity ID: ${codeId} (${count} duplicates)`)
        const details = record.get('entityDetails')
        for (let i = 0; i < details.length; i++) {
          console.log(`    Instance ${i + 1}:`)
          console.log(`      Name: ${details[i].name}`)
          console.log(`      Path: ${details[i].file_path}`)
          console.log(`      Created: ${new Date(details[i].created_at).toLocaleString()}`)
          console.log(`      User ID: ${details[i].user_id}`)
          console.log(`      Workspace ID: ${details[i].workspace_id}`)
          console.log(`      Project: ${details[i].project_name}`)
        }
      }
    }
    
    // 3. Check for duplicate EntityChunk nodes
    console.log('\n\n3. Checking for duplicate EntityChunk nodes by id:')
    const duplicateChunks = await session.run(`
      MATCH (ch:EntityChunk)
      WITH ch.id as chunkId, collect(ch) as chunks, count(ch) as count
      WHERE count > 1
      RETURN chunkId, count, 
             [c IN chunks | {
               chunk_index: c.chunk_index,
               entity_id: c.entity_id,
               created_at: c.created_at
             }] as chunkDetails
      ORDER BY count DESC
      LIMIT 10
    `)
    
    if (duplicateChunks.records.length === 0) {
      console.log('  ✓ No duplicate EntityChunk nodes found')
    } else {
      console.log(`  ✗ Found ${duplicateChunks.records.length} EntityChunk IDs with duplicates:`)
      for (const record of duplicateChunks.records) {
        const chunkId = record.get('chunkId')
        const count = record.get('count').toNumber()
        console.log(`\n  Chunk ID: ${chunkId} (${count} duplicates)`)
      }
    }
    
    // 4. Check recent Memory ingestion patterns
    console.log('\n\n4. Recent Memory ingestion patterns:')
    const memoryPattern = await session.run(`
      MATCH (m:Memory)
      WHERE m.created_at > datetime() - duration('P1D')
      WITH m.user_id as userId, m.workspace_id as workspaceId, 
           date(m.created_at) as day,
           datetime({epochMillis: toInteger(m.created_at.epochMillis / 60000) * 60000}) as minute,
           count(m) as count
      RETURN userId, workspaceId, minute, count
      ORDER BY minute DESC
      LIMIT 20
    `)
    
    console.log('  Recent memory ingestions (by minute):')
    for (const record of memoryPattern.records) {
      const userId = record.get('userId')
      const workspaceId = record.get('workspaceId')
      const minute = record.get('minute')
      const count = record.get('count').toNumber()
      console.log(`    ${new Date(minute).toLocaleString()}: ${count} memories (user: ${userId}, workspace: ${workspaceId})`)
    }
    
    // 5. Check recent CodeEntity ingestion patterns
    console.log('\n\n5. Recent CodeEntity ingestion patterns:')
    const codePattern = await session.run(`
      MATCH (c:CodeEntity)
      WHERE c.created_at > datetime() - duration('P1D')
      WITH c.user_id as userId, c.workspace_id as workspaceId,
           date(c.created_at) as day,
           datetime({epochMillis: toInteger(c.created_at.epochMillis / 60000) * 60000}) as minute,
           count(c) as count
      RETURN userId, workspaceId, minute, count
      ORDER BY minute DESC
      LIMIT 20
    `)
    
    console.log('  Recent code entity ingestions (by minute):')
    if (codePattern.records.length === 0) {
      console.log('    No recent CodeEntity ingestions found')
    } else {
      for (const record of codePattern.records) {
        const userId = record.get('userId')
        const workspaceId = record.get('workspaceId')
        const minute = record.get('minute')
        const count = record.get('count').toNumber()
        console.log(`    ${new Date(minute).toLocaleString()}: ${count} entities (user: ${userId}, workspace: ${workspaceId})`)
      }
    }
    
    // 6. Check for memories being ingested multiple times
    console.log('\n\n6. Checking if same memory content is ingested multiple times:')
    const duplicateContent = await session.run(`
      MATCH (m1:Memory), (m2:Memory)
      WHERE m1.id < m2.id 
        AND m1.content = m2.content
        AND m1.user_id = m2.user_id
      WITH m1, m2
      LIMIT 5
      RETURN m1.id as id1, m2.id as id2, 
             m1.created_at as created1, m2.created_at as created2,
             substring(m1.content, 0, 100) as contentPreview,
             m1.user_id as userId
    `)
    
    if (duplicateContent.records.length === 0) {
      console.log('  ✓ No duplicate memory content found')
    } else {
      console.log('  ✗ Found memories with duplicate content:')
      for (const record of duplicateContent.records) {
        console.log(`\n  IDs: ${record.get('id1')} and ${record.get('id2')}`)
        console.log(`  Created: ${new Date(record.get('created1')).toLocaleString()} and ${new Date(record.get('created2')).toLocaleString()}`)
        console.log(`  User: ${record.get('userId')}`)
        console.log(`  Content: "${record.get('contentPreview')}..."`)
      }
    }
    
    // 7. Check EntitySummary relationships
    console.log('\n\n7. Checking EntitySummary relationship patterns:')
    const summaryRelations = await session.run(`
      MATCH (s:EntitySummary)-[r:SUMMARIZES]->(e)
      WITH labels(e)[0] as entityType, count(distinct s) as summaryCount, count(distinct e) as entityCount
      RETURN entityType, summaryCount, entityCount
      ORDER BY summaryCount DESC
    `)
    
    console.log('  EntitySummary relationships by entity type:')
    for (const record of summaryRelations.records) {
      const entityType = record.get('entityType')
      const summaryCount = record.get('summaryCount').toNumber()
      const entityCount = record.get('entityCount').toNumber()
      const ratio = (summaryCount / entityCount).toFixed(2)
      console.log(`    ${entityType}: ${summaryCount} summaries for ${entityCount} entities (ratio: ${ratio})`)
    }
    
    // 8. Check for orphaned EntitySummary nodes
    console.log('\n\n8. Checking for orphaned EntitySummary nodes:')
    const orphaned = await session.run(`
      MATCH (s:EntitySummary)
      WHERE NOT (s)-[:SUMMARIZES]->()
      RETURN count(s) as orphanedCount,
             collect(distinct s.entity_type)[0..5] as sampleTypes,
             collect(s.id)[0..5] as sampleIds
    `)
    
    const orphanedCount = orphaned.records[0].get('orphanedCount').toNumber()
    if (orphanedCount === 0) {
      console.log('  ✓ No orphaned EntitySummary nodes found')
    } else {
      console.log(`  ✗ Found ${orphanedCount} orphaned EntitySummary nodes`)
      console.log(`  Sample types: ${orphaned.records[0].get('sampleTypes').join(', ')}`)
      console.log(`  Sample IDs: ${orphaned.records[0].get('sampleIds').join(', ')}`)
    }
    
    // 9. Total node counts
    console.log('\n\n9. Total node counts:')
    const counts = await session.run(`
      MATCH (n)
      WITH labels(n)[0] as label, count(n) as count
      WHERE label IS NOT NULL
      RETURN label, count
      ORDER BY count DESC
    `)
    
    console.log('  Node counts by label:')
    for (const record of counts.records) {
      const label = record.get('label')
      const count = record.get('count').toNumber()
      console.log(`    ${label}: ${count}`)
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

main().catch(console.error)