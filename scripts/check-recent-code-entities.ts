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
    console.log('=== Checking Recent CodeEntity Creation ===\n')
    
    // 1. Check the most recent CodeEntity nodes
    console.log('1. Most recent CodeEntity nodes:')
    const recentCode = await session.run(`
      MATCH (c:CodeEntity)
      RETURN c.id as id, c.name as name, c.file_path as path, 
             c.created_at as created_at, c.user_id as user_id,
             c.workspace_id as workspace_id, c.project_name as project
      ORDER BY c.created_at DESC
      LIMIT 10
    `)
    
    if (recentCode.records.length === 0) {
      console.log('  No CodeEntity nodes found!')
    } else {
      for (const record of recentCode.records) {
        const createdAt = record.get('created_at')
        console.log(`\n  ${record.get('name')}`)
        console.log(`    ID: ${record.get('id')}`)
        console.log(`    Path: ${record.get('path')}`)
        console.log(`    Created: ${new Date(createdAt).toLocaleString()}`)
        console.log(`    User: ${record.get('user_id')}`)
        console.log(`    Workspace: ${record.get('workspace_id')}`)
        console.log(`    Project: ${record.get('project')}`)
      }
    }
    
    // 2. Check if there are any code entities created in the last hour
    console.log('\n\n2. CodeEntity nodes created in last hour:')
    const lastHour = await session.run(`
      MATCH (c:CodeEntity)
      WHERE c.created_at > datetime() - duration('PT1H')
      RETURN count(c) as count,
             collect(distinct c.project_name) as projects,
             min(c.created_at) as earliest,
             max(c.created_at) as latest
    `)
    
    const count = lastHour.records[0].get('count').toNumber()
    if (count === 0) {
      console.log('  No CodeEntity nodes created in the last hour')
    } else {
      const earliest = lastHour.records[0].get('earliest')
      const latest = lastHour.records[0].get('latest')
      const projects = lastHour.records[0].get('projects')
      console.log(`  Found ${count} CodeEntity nodes`)
      console.log(`  Earliest: ${new Date(earliest).toLocaleString()}`)
      console.log(`  Latest: ${new Date(latest).toLocaleString()}`)
      console.log(`  Projects: ${projects.join(', ')}`)
    }
    
    // 3. Check CodeEntity creation by day
    console.log('\n\n3. CodeEntity creation by day:')
    const byDay = await session.run(`
      MATCH (c:CodeEntity)
      WITH date(c.created_at) as day, count(c) as count
      RETURN day, count
      ORDER BY day DESC
      LIMIT 7
    `)
    
    for (const record of byDay.records) {
      const day = record.get('day')
      const count = record.get('count').toNumber()
      console.log(`  ${day}: ${count} entities`)
    }
    
    // 4. Check unique users and workspaces with CodeEntity
    console.log('\n\n4. Users and workspaces with CodeEntity nodes:')
    const owners = await session.run(`
      MATCH (c:CodeEntity)
      WITH DISTINCT c.user_id as user_id, c.workspace_id as workspace_id, count(c) as count
      RETURN user_id, workspace_id, count
      ORDER BY count DESC
    `)
    
    for (const record of owners.records) {
      const userId = record.get('user_id')
      const workspaceId = record.get('workspace_id')
      const count = record.get('count').toNumber()
      console.log(`  User: ${userId}`)
      console.log(`  Workspace: ${workspaceId}`)
      console.log(`  Count: ${count}`)
      console.log()
    }
    
    // 5. Check for any relationships from recent memories to code
    console.log('\n5. Recent Memory->CodeEntity relationships:')
    const memoryCodeRels = await session.run(`
      MATCH (m:Memory)-[r:REFERENCES_CODE]->(c:CodeEntity)
      WHERE m.created_at > datetime() - duration('PT1H')
      RETURN m.id as memoryId, c.id as codeId, c.name as codeName,
             m.created_at as memCreated, c.created_at as codeCreated
      ORDER BY m.created_at DESC
      LIMIT 5
    `)
    
    if (memoryCodeRels.records.length === 0) {
      console.log('  No recent Memory->CodeEntity relationships found')
    } else {
      for (const record of memoryCodeRels.records) {
        console.log(`\n  Memory ${record.get('memoryId')} -> Code ${record.get('codeName')}`)
        console.log(`    Memory created: ${new Date(record.get('memCreated')).toLocaleString()}`)
        console.log(`    Code created: ${new Date(record.get('codeCreated')).toLocaleString()}`)
      }
    }
    
    // 6. Check the code ingestion queue status
    console.log('\n\n6. Checking for any pending code in queues:')
    // We'll check if there are any issues with the ingestion process
    const functionNodes = await session.run(`
      MATCH (f:Function)
      RETURN count(f) as functionCount,
             collect(distinct f.project_name)[0..5] as sampleProjects
    `)
    
    const functionCount = functionNodes.records[0].get('functionCount').toNumber()
    const sampleProjects = functionNodes.records[0].get('sampleProjects')
    console.log(`  Function nodes: ${functionCount}`)
    console.log(`  Sample projects: ${sampleProjects.join(', ')}`)
    
    // 7. Check for any error patterns in entity creation
    console.log('\n\n7. Checking entity type distribution:')
    const entityTypes = await session.run(`
      MATCH (n)
      WHERE n:CodeEntity OR n:Function OR n:Class
      WITH labels(n)[0] as label, count(n) as count,
           max(n.created_at) as latestCreation
      RETURN label, count, latestCreation
      ORDER BY count DESC
    `)
    
    for (const record of entityTypes.records) {
      const label = record.get('label')
      const count = record.get('count').toNumber()
      const latest = record.get('latestCreation')
      console.log(`  ${label}: ${count} nodes (latest: ${new Date(latest).toLocaleString()})`)
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

main().catch(console.error)