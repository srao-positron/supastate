#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'
import neo4j from 'neo4j-driver'

const SUPABASE_URL = 'https://zqlfxakbkwssxfynrmnk.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxbGZ4YWtia3dzc3hmeW5ybW5rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzEyNDMxMiwiZXhwIjoyMDY4NzAwMzEyfQ.Dvvga6Y4vu7xtorjzgQ3B4kjoJYvISQcnOEAIuoFSOU'

const NEO4J_URI = 'neo4j+s://eb61aceb.databases.neo4j.io'
const NEO4J_USER = 'neo4j'
const NEO4J_PASSWORD = 'XROfdG-0_Idz6zzm6s1C5Bwao6GgW_84T7BeT_uvtW8'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  console.log('=== Checking Code Entity Issue ===\n')
  
  // Check one of the missing IDs
  const missingId = 'dcd8022c-34ba-46eb-98d9-b0365f800d7f'
  
  // 1. Check if it exists in Supabase
  console.log(`1. Checking Supabase for code entity ${missingId}:`)
  const { data: codeEntity } = await supabase
    .from('code_entities')
    .select('*')
    .eq('id', missingId)
    .single()
  
  if (codeEntity) {
    console.log('  Found in Supabase:')
    console.log(`    Name: ${codeEntity.name}`)
    console.log(`    Path: ${codeEntity.path}`)
    console.log(`    Created: ${codeEntity.created_at}`)
  } else {
    console.log('  NOT found in Supabase')
  }
  
  // 2. Check if it exists in Neo4j
  console.log(`\n2. Checking Neo4j for code entity ${missingId}:`)
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
  )
  
  const session = driver.session()
  
  try {
    const result = await session.run(`
      MATCH (c:CodeEntity {id: $id})
      RETURN c
    `, { id: missingId })
    
    if (result.records.length > 0) {
      console.log('  Found in Neo4j')
    } else {
      console.log('  NOT found in Neo4j')
    }
    
    // 3. Check recent code entity creation pattern
    console.log('\n3. Recent code entities in Supabase vs Neo4j:')
    
    // Get recent from Supabase
    const { data: recentSupabase } = await supabase
      .from('code_entities')
      .select('id')
      .order('created_at', { ascending: false })
      .limit(10)
    
    if (recentSupabase) {
      console.log(`  Checking ${recentSupabase.length} recent Supabase entities in Neo4j:`)
      
      let foundCount = 0
      for (const entity of recentSupabase) {
        const checkResult = await session.run(`
          MATCH (c:CodeEntity {id: $id})
          RETURN count(c) as count
        `, { id: entity.id })
        
        const count = checkResult.records[0].get('count').toNumber()
        if (count > 0) {
          foundCount++
        } else {
          console.log(`    Missing in Neo4j: ${entity.id}`)
        }
      }
      
      console.log(`  Found ${foundCount}/${recentSupabase.length} in Neo4j`)
    }
    
    // 4. Check duplicate EntitySummary issue
    console.log('\n4. Duplicate EntitySummary details:')
    const dupResult = await session.run(`
      MATCH (s:EntitySummary)
      WITH s.entity_id as entityId, s.entity_type as entityType, count(*) as copies, collect(s) as summaries
      WHERE copies > 1
      RETURN entityId, entityType, copies
      ORDER BY copies DESC
      LIMIT 5
    `)
    
    for (const record of dupResult.records) {
      const entityId = record.get('entityId')
      const entityType = record.get('entityType')
      const copies = record.get('copies').toNumber()
      console.log(`  ${entityType} ${entityId}: ${copies} copies`)
    }
    
    // 5. Check if pattern processor is running at all
    console.log('\n5. Pattern processor activity:')
    const { data: patternLogs } = await supabase
      .from('pattern_processor_logs')
      .select('created_at, message, batch_id')
      .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(5)
    
    if (patternLogs && patternLogs.length > 0) {
      for (const log of patternLogs) {
        const time = new Date(log.created_at).toLocaleTimeString()
        console.log(`  [${time}] ${log.message}`)
      }
    } else {
      console.log('  No pattern processor activity in last 5 minutes')
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

main().catch(console.error)