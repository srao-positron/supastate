#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'
import neo4j from 'neo4j-driver'

const SUPABASE_URL = 'https://zqlfxakbkwssxfynrmnk.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxbGZ4YWtia3dzc3hmeW5ybW5rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzEyNDMxMiwiZXhwIjoyMDY4NzAwMzEyfQ.Dvvga6Y4vu7xtorjzgQ3B4kjoJYvISQcnOEAIuoFSOU'

const NEO4J_URI = 'neo4j+s://eb61aceb.databases.neo4j.io'
const NEO4J_USER = 'neo4j'
const NEO4J_PASSWORD = 'XROfdG-0_Idz6zzm6s1C5Bwao6GgW_84T7BeT_uvtW8'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function checkIngestionStatus() {
  console.log('\n=== Monitoring Camille Clean Run ===')
  console.log(`Time: ${new Date().toLocaleTimeString()}\n`)
  
  // 1. Check Supabase ingestion
  console.log('1. Supabase Ingestion Status:')
  
  const { count: memoryCount } = await supabase
    .from('memories')
    .select('*', { count: 'exact', head: true })
  
  const { count: codeCount } = await supabase
    .from('code_entities')
    .select('*', { count: 'exact', head: true })
    
  const { count: fileCount } = await supabase
    .from('code_files')
    .select('*', { count: 'exact', head: true })
  
  console.log(`  Memories: ${memoryCount || 0}`)
  console.log(`  Code entities: ${codeCount || 0}`)
  console.log(`  Code files: ${fileCount || 0}`)
  
  // 2. Check queue status
  console.log('\n2. Queue Status:')
  const { data: queueStatus } = await supabase.rpc('pgmq_metrics_all')
  
  if (queueStatus) {
    for (const queue of queueStatus) {
      if (['memory_ingestion', 'code_ingestion', 'pattern_detection'].includes(queue.queue_name)) {
        console.log(`  ${queue.queue_name}: ${queue.queue_length} pending, ${queue.total_messages || 0} total`)
      }
    }
  }
  
  // 3. Check Neo4j data
  console.log('\n3. Neo4j Status:')
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
  )
  
  const session = driver.session()
  
  try {
    // Count nodes
    const nodeResult = await session.run(`
      MATCH (n)
      RETURN labels(n)[0] as label, count(n) as count
      ORDER BY count DESC
    `)
    
    let hasData = false
    for (const record of nodeResult.records) {
      const label = record.get('label')
      const count = record.get('count').toNumber()
      if (count > 0) {
        console.log(`  ${label}: ${count} nodes`)
        hasData = true
      }
    }
    
    if (!hasData) {
      console.log('  No nodes yet')
    }
    
    // Check for duplicates
    console.log('\n4. Checking for Duplicates:')
    
    // Check EntitySummary duplicates
    const dupResult = await session.run(`
      MATCH (s:EntitySummary)
      WITH s.entity_id as entityId, s.entity_type as entityType, count(*) as copies
      WHERE copies > 1
      RETURN count(*) as duplicateCount
    `)
    
    const duplicates = dupResult.records[0]?.get('duplicateCount')?.toNumber() || 0
    if (duplicates > 0) {
      console.log(`  ❌ Found ${duplicates} duplicate EntitySummary nodes!`)
    } else {
      console.log('  ✅ No duplicate EntitySummary nodes')
    }
    
    // Check relationships
    const relResult = await session.run(`
      MATCH ()-[r:RELATES_TO]-()
      RETURN count(r) as count
    `)
    
    const relCount = relResult.records[0]?.get('count')?.toNumber() || 0
    console.log(`\n5. Memory-Code Relationships: ${relCount}`)
    
    // Check pattern detection logs
    console.log('\n6. Recent Pattern Detection:')
    const { data: patternLogs } = await supabase
      .from('pattern_processor_logs')
      .select('created_at, message, metadata')
      .or('message.like.%Found % patterns%,message.like.%relationships%')
      .gte('created_at', new Date(Date.now() - 2 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(5)
    
    if (patternLogs && patternLogs.length > 0) {
      for (const log of patternLogs) {
        const time = new Date(log.created_at).toLocaleTimeString()
        console.log(`  [${time}] ${log.message}`)
      }
    } else {
      console.log('  No recent pattern detection activity')
    }
    
    // Check for any errors
    console.log('\n7. Recent Errors:')
    const { data: errorLogs } = await supabase
      .from('pattern_processor_logs')
      .select('created_at, message, error_stack')
      .eq('level', 'error')
      .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(3)
    
    if (errorLogs && errorLogs.length > 0) {
      for (const log of errorLogs) {
        const time = new Date(log.created_at).toLocaleTimeString()
        console.log(`  ❌ [${time}] ${log.message}`)
        if (log.error_stack) {
          console.log(`     ${log.error_stack.split('\n')[0]}`)
        }
      }
    } else {
      console.log('  ✅ No errors in the last 5 minutes')
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

// Run monitoring
async function monitor() {
  // Run once immediately
  await checkIngestionStatus()
  
  // Then run every 30 seconds
  setInterval(async () => {
    console.log('\n' + '='.repeat(50))
    await checkIngestionStatus()
  }, 30000)
}

monitor().catch(console.error)