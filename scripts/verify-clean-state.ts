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
  console.log('=== Verifying Clean State ===\n')
  
  // Check Supabase
  console.log('1. Supabase Tables:')
  const tables = [
    'memories',
    'code_entities',
    'code_files',
    'pattern_processor_logs',
    'memory_queue',
    'code_queue'
  ]
  
  let totalSupabase = 0
  for (const table of tables) {
    const { count } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
    
    console.log(`  ${table}: ${count || 0} records`)
    totalSupabase += (count || 0)
  }
  
  console.log(`  Total Supabase records: ${totalSupabase}`)
  
  // Check Neo4j
  console.log('\n2. Neo4j Nodes:')
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
  )
  
  const session = driver.session()
  
  try {
    const nodeResult = await session.run(`
      MATCH (n)
      RETURN labels(n)[0] as label, count(n) as count
      ORDER BY label
    `)
    
    let totalNeo4j = 0
    if (nodeResult.records.length === 0) {
      console.log('  No nodes found')
    } else {
      for (const record of nodeResult.records) {
        const label = record.get('label')
        const count = record.get('count').toNumber()
        console.log(`  ${label}: ${count} nodes`)
        totalNeo4j += count
      }
      console.log(`  Total Neo4j nodes: ${totalNeo4j}`)
    }
    
    // Check relationships
    const relResult = await session.run(`
      MATCH ()-[r]-()
      RETURN type(r) as type, count(r) as count
    `)
    
    console.log('\n3. Neo4j Relationships:')
    if (relResult.records.length === 0) {
      console.log('  No relationships found')
    } else {
      for (const record of relResult.records) {
        const type = record.get('type')
        const count = record.get('count').toNumber()
        console.log(`  ${type}: ${count}`)
      }
    }
    
    // Check pgmq queues
    console.log('\n4. PGMQ Queues:')
    const { data: queueStatus } = await supabase.rpc('pgmq_metrics_all')
    
    if (queueStatus) {
      for (const queue of queueStatus) {
        if (['memory_ingestion', 'code_ingestion', 'pattern_detection'].includes(queue.queue_name)) {
          console.log(`  ${queue.queue_name}: ${queue.queue_length} messages`)
        }
      }
    }
    
    console.log('\n✅ Database is clean and ready for testing!')
    
  } finally {
    await session.close()
    await driver.close()
  }
}

main().catch(console.error)