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
  console.log('=== Checking Pattern Detection Success ===\n')
  
  // 1. Check recent successful pattern detection logs
  console.log('1. Recent successful pattern detections:')
  const { data: successLogs } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .like('message', '%Found % patterns')
    .not('message', 'like', '%Found 0%')
    .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(10)
  
  if (successLogs && successLogs.length > 0) {
    for (const log of successLogs) {
      const time = new Date(log.created_at).toLocaleTimeString()
      console.log(`  [${time}] ${log.message}`)
      if (log.metadata?.patternCount) {
        console.log(`    Count: ${log.metadata.patternCount}`)
      }
    }
  } else {
    console.log('  No successful pattern detections found')
  }
  
  // 2. Check if patterns were stored in Neo4j
  console.log('\n2. Patterns in Neo4j:')
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
  )
  
  const session = driver.session()
  
  try {
    const patternResult = await session.run(`
      MATCH (p:Pattern)
      WHERE p.last_updated > datetime() - duration('PT10M')
      RETURN p.pattern_type as type, p.pattern_name as name, p.frequency as freq, p.confidence as conf
      ORDER BY p.last_updated DESC
      LIMIT 20
    `)
    
    if (patternResult.records.length > 0) {
      console.log(`  Found ${patternResult.records.length} recent patterns:`)
      for (const record of patternResult.records) {
        console.log(`    ${record.get('type')} - ${record.get('name')}: freq=${record.get('freq')}, conf=${record.get('conf')}`)
      }
    } else {
      console.log('  No recent patterns found in Neo4j')
    }
    
    // 3. Check memory-code relationships
    console.log('\n3. Memory-Code Relationships:')
    const relResult = await session.run(`
      MATCH (m:Memory)-[r:RELATES_TO]-(c:CodeEntity)
      WHERE r.detected_at > datetime() - duration('PT10M')
      RETURN count(r) as count, 
             avg(r.similarity) as avgSim,
             collect(DISTINCT r.detection_method)[0..5] as methods
    `)
    
    if (relResult.records.length > 0) {
      const count = relResult.records[0].get('count').toNumber()
      const avgSim = relResult.records[0].get('avgSim')
      const methods = relResult.records[0].get('methods')
      
      console.log(`  Total relationships: ${count}`)
      if (avgSim) console.log(`  Average similarity: ${avgSim.toFixed(3)}`)
      if (methods && methods.length > 0) console.log(`  Detection methods: ${methods.join(', ')}`)
    } else {
      console.log('  No recent memory-code relationships found')
    }
    
    // 4. Check specific memory-code pattern logs
    console.log('\n4. Memory-Code Pattern Detection Logs:')
    const { data: mcLogs } = await supabase
      .from('pattern_processor_logs')
      .select('*')
      .or('message.like.%memory-code%,message.like.%Created % semantic memory-code relationships%')
      .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(10)
    
    if (mcLogs && mcLogs.length > 0) {
      for (const log of mcLogs) {
        const time = new Date(log.created_at).toLocaleTimeString()
        console.log(`  [${time}] ${log.message}`)
        if (log.metadata?.relationshipCount !== undefined) {
          console.log(`    Relationships: ${log.metadata.relationshipCount}`)
        }
      }
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

main().catch(console.error)