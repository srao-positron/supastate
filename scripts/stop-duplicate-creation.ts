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
  console.log('=== Stopping Duplicate Creation ===\n')
  
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
  )
  
  const session = driver.session()
  
  try {
    // 1. First, clean up existing duplicates
    console.log('1. Cleaning up existing duplicate EntitySummary nodes...')
    
    const dupResult = await session.run(`
      MATCH (s:EntitySummary)
      WITH s.entity_id as entityId, s.entity_type as entityType, collect(s) as summaries
      WHERE size(summaries) > 1
      WITH entityId, entityType, summaries, 
           head(summaries) as keepNode,
           tail(summaries) as deleteNodes
      UNWIND deleteNodes as deleteNode
      DETACH DELETE deleteNode
      RETURN count(deleteNode) as deleted
    `)
    
    const deleted = dupResult.records[0]?.get('deleted')?.toNumber() || 0
    console.log(`  Deleted ${deleted} duplicate nodes`)
    
    // 2. Create unique constraint if it doesn't exist
    console.log('\n2. Ensuring unique constraint exists...')
    try {
      await session.run(`
        CREATE CONSTRAINT entity_summary_unique IF NOT EXISTS
        FOR (s:EntitySummary) 
        REQUIRE (s.entity_id, s.entity_type) IS UNIQUE
      `)
      console.log('  ✅ Unique constraint is in place')
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('  ✅ Unique constraint already exists')
      } else {
        console.error('  ❌ Error creating constraint:', error.message)
      }
    }
    
    // 3. Check why code entities aren't in Neo4j
    console.log('\n3. Checking code ingestion sync issue...')
    
    // Get a sample of recent code entities from Supabase
    const { data: recentCodes } = await supabase
      .from('code_entities')
      .select('id, name, created_at')
      .order('created_at', { ascending: false })
      .limit(5)
    
    if (recentCodes) {
      console.log(`  Recent code entities in Supabase:`)
      for (const code of recentCodes) {
        // Check if exists in Neo4j
        const neoResult = await session.run(`
          MATCH (c:CodeEntity {id: $id})
          RETURN count(c) as count
        `, { id: code.id })
        
        const exists = neoResult.records[0].get('count').toNumber() > 0
        console.log(`    ${code.name}: ${exists ? '✅ In Neo4j' : '❌ Missing from Neo4j'}`)
      }
    }
    
    // 4. Check coordinator frequency
    console.log('\n4. Checking coordinator activity (potential duplicate source):')
    const { data: coordLogs } = await supabase
      .from('pattern_processor_logs')
      .select('created_at, message')
      .like('message', '%coordinator started%')
      .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
    
    if (coordLogs) {
      const coordTypes = {
        memory: 0,
        code: 0,
        pattern: 0
      }
      
      for (const log of coordLogs) {
        if (log.message.includes('Memory')) coordTypes.memory++
        else if (log.message.includes('Code')) coordTypes.code++
        else if (log.message.includes('Pattern')) coordTypes.pattern++
      }
      
      console.log(`  Memory coordinator runs: ${coordTypes.memory}`)
      console.log(`  Code coordinator runs: ${coordTypes.code}`)
      console.log(`  Pattern coordinator runs: ${coordTypes.pattern}`)
      console.log(`  Total in 5 minutes: ${coordLogs.length}`)
      
      if (coordLogs.length > 20) {
        console.log('\n  ⚠️  WARNING: Coordinators running too frequently!')
        console.log('  This is likely causing the duplicate EntitySummary creation.')
      }
    }
    
    // 5. Check pattern detection activity
    console.log('\n5. Pattern detection status:')
    const { data: patternLogs } = await supabase
      .from('pattern_processor_logs')
      .select('created_at, message')
      .or('message.like.%Found % patterns%,message.like.%relationships created%')
      .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(5)
    
    if (patternLogs && patternLogs.length > 0) {
      for (const log of patternLogs) {
        const time = new Date(log.created_at).toLocaleTimeString()
        console.log(`  [${time}] ${log.message}`)
      }
    } else {
      console.log('  No pattern detection activity')
    }
    
    // 6. Final status
    console.log('\n6. Current Neo4j Status:')
    const statusResult = await session.run(`
      MATCH (n)
      RETURN labels(n)[0] as label, count(n) as count
      ORDER BY count DESC
    `)
    
    for (const record of statusResult.records) {
      const label = record.get('label')
      const count = record.get('count').toNumber()
      console.log(`  ${label}: ${count}`)
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

main().catch(console.error)