#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zqlfxakbkwssxfynrmnk.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxbGZ4YWtia3dzc3hmeW5ybW5rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzEyNDMxMiwiZXhwIjoyMDY4NzAwMzEyfQ.Dvvga6Y4vu7xtorjzgQ3B4kjoJYvISQcnOEAIuoFSOU'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  console.log('=== All Recent Pattern Processor Logs (Last 2 Minutes) ===\n')
  
  // Get all logs from the last 2 minutes
  const { data: logs, error } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .gte('created_at', new Date(Date.now() - 2 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(50)
  
  if (error) {
    console.error('Error fetching logs:', error)
    return
  }
  
  if (!logs || logs.length === 0) {
    console.log('No logs found in the last 2 minutes')
    return
  }
  
  // Group by batch
  const batches = new Map<string, any[]>()
  for (const log of logs) {
    const batchId = log.batch_id || 'no-batch'
    if (!batches.has(batchId)) {
      batches.set(batchId, [])
    }
    batches.get(batchId)!.push(log)
  }
  
  console.log(`Found ${logs.length} logs in ${batches.size} batches\n`)
  
  // Show each batch
  for (const [batchId, batchLogs] of batches) {
    console.log(`\n=== Batch: ${batchId} ===`)
    console.log(`Time: ${new Date(batchLogs[0].created_at).toLocaleString()}`)
    console.log(`Log count: ${batchLogs.length}\n`)
    
    // Show logs in chronological order
    for (const log of batchLogs.reverse()) {
      const time = new Date(log.created_at).toLocaleTimeString()
      console.log(`[${time}] [${log.level}] ${log.message}`)
      
      if (log.metadata) {
        const meta = log.metadata
        const keys = Object.keys(meta).filter(k => 
          !['functionName', 'batchId'].includes(k) && meta[k] !== undefined
        )
        if (keys.length > 0) {
          console.log(`  → ${keys.map(k => `${k}: ${meta[k]}`).join(', ')}`)
        }
      }
      
      if (log.error_stack) {
        console.log(`  → Error: ${log.error_stack.split('\n')[0]}`)
      }
    }
  }
}

main().catch(console.error)