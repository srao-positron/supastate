#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zqlfxakbkwssxfynrmnk.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxbGZ4YWtia3dzc3hmeW5ybW5rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzEyNDMxMiwiZXhwIjoyMDY4NzAwMzEyfQ.Dvvga6Y4vu7xtorjzgQ3B4kjoJYvISQcnOEAIuoFSOU'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  console.log('=== Checking All Ingestion Logs ===\n')
  
  // Get all unique batch_ids from recent logs
  console.log('1. All unique batch IDs (last 10 minutes):')
  const { data: allLogs } = await supabase
    .from('pattern_processor_logs')
    .select('batch_id, message')
    .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
  
  if (allLogs) {
    const batchIds = new Map<string, number>()
    for (const log of allLogs) {
      if (log.batch_id) {
        batchIds.set(log.batch_id, (batchIds.get(log.batch_id) || 0) + 1)
      }
    }
    
    // Sort by count and show top batch IDs
    const sorted = Array.from(batchIds.entries()).sort((a, b) => b[1] - a[1])
    for (const [batchId, count] of sorted.slice(0, 10)) {
      console.log(`  ${batchId}: ${count} logs`)
    }
  }
  
  // Check for any logs mentioning code or Code
  console.log('\n2. All logs mentioning "code" (case insensitive):')
  const { data: codeLogs } = await supabase
    .from('pattern_processor_logs')
    .select('created_at, batch_id, level, message')
    .or('message.ilike.%code%,batch_id.ilike.%code%')
    .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(20)
  
  if (codeLogs && codeLogs.length > 0) {
    for (const log of codeLogs) {
      const time = new Date(log.created_at).toLocaleTimeString()
      console.log(`  [${time}] [${log.level}] ${log.batch_id || 'no-batch'}: ${log.message.substring(0, 100)}...`)
    }
  }
  
  // Check for specific function names
  console.log('\n3. Looking for edge function logs:')
  const functionNames = [
    'code-ingestion-worker',
    'code-ingestion-coordinator', 
    'ingest-code-to-neo4j',
    'ingest-code'
  ]
  
  for (const funcName of functionNames) {
    const { data: funcLogs } = await supabase
      .from('pattern_processor_logs')
      .select('created_at, message')
      .or(`batch_id.eq.${funcName},message.like.%${funcName}%`)
      .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
      .limit(5)
    
    if (funcLogs && funcLogs.length > 0) {
      console.log(`\n  ${funcName}:`)
      for (const log of funcLogs) {
        const time = new Date(log.created_at).toLocaleTimeString()
        console.log(`    [${time}] ${log.message}`)
      }
    } else {
      console.log(`  ${funcName}: No logs found`)
    }
  }
  
  // Check coordinator logs specifically
  console.log('\n4. Coordinator Activity:')
  const { data: coordLogs } = await supabase
    .from('pattern_processor_logs')
    .select('created_at, message, metadata')
    .like('message', '%coordinator%')
    .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(10)
  
  if (coordLogs && coordLogs.length > 0) {
    for (const log of coordLogs) {
      const time = new Date(log.created_at).toLocaleTimeString()
      console.log(`  [${time}] ${log.message}`)
      if (log.metadata?.spawnCount) {
        console.log(`    Spawned ${log.metadata.spawnCount} workers`)
      }
    }
  }
}

main().catch(console.error)