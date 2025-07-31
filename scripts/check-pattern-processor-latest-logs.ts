#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zqlfxakbkwssxfynrmnk.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxbGZ4YWtia3dzc3hmeW5ybW5rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzEyNDMxMiwiZXhwIjoyMDY4NzAwMzEyfQ.Dvvga6Y4vu7xtorjzgQ3B4kjoJYvISQcnOEAIuoFSOU'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  console.log('=== Latest Pattern Processor Logs ===\n')
  
  // Get the most recent logs from pattern processor
  const { data: logs, error } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20)
  
  if (error) {
    console.error('Error fetching logs:', error)
    return
  }
  
  if (!logs || logs.length === 0) {
    console.log('No pattern processor logs found')
    return
  }
  
  // Group by batch_id
  const batches = new Map<string, any[]>()
  for (const log of logs) {
    const batchId = log.batch_id || 'unknown'
    if (!batches.has(batchId)) {
      batches.set(batchId, [])
    }
    batches.get(batchId)!.push(log)
  }
  
  // Show latest batch
  const [latestBatchId, latestBatchLogs] = Array.from(batches.entries())[0]
  console.log(`Latest Batch: ${latestBatchId}`)
  console.log(`Time: ${new Date(latestBatchLogs[0].created_at).toLocaleString()}\n`)
  
  for (const log of latestBatchLogs.reverse()) {
    const time = new Date(log.created_at).toLocaleTimeString()
    console.log(`[${time}] [${log.level}] ${log.message}`)
    
    if (log.metadata) {
      const meta = log.metadata
      if (meta.relationshipCount !== undefined) {
        console.log(`  → Relationships created: ${meta.relationshipCount}`)
      }
      if (meta.error) {
        console.log(`  → Error: ${meta.error}`)
      }
      if (meta.functionName) {
        console.log(`  → Function: ${meta.functionName}`)
      }
    }
    
    if (log.error_stack) {
      console.log('  Stack trace:')
      const lines = log.error_stack.split('\n').slice(0, 3)
      lines.forEach(line => console.log(`    ${line}`))
    }
  }
  
  // Check for success
  const successLogs = logs.filter(log => 
    log.message.includes('created') && 
    log.message.includes('relationships')
  )
  
  if (successLogs.length > 0) {
    console.log('\n=== Relationship Creation Success ===')
    for (const log of successLogs.slice(0, 3)) {
      console.log(`[${new Date(log.created_at).toLocaleTimeString()}] ${log.message}`)
    }
  }
}

main().catch(console.error)