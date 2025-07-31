#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zqlfxakbkwssxfynrmnk.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxbGZ4YWtia3dzc3hmeW5ybW5rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzEyNDMxMiwiZXhwIjoyMDY4NzAwMzEyfQ.Dvvga6Y4vu7xtorjzgQ3B4kjoJYvISQcnOEAIuoFSOU'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  console.log('=== Recent Pattern Processor Logs ===\n')
  
  // Get logs from the last 5 minutes
  const { data: logs, error } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(50)
  
  if (error) {
    console.error('Error fetching logs:', error)
    return
  }
  
  if (!logs || logs.length === 0) {
    console.log('No logs found in the last 5 minutes')
    return
  }
  
  // Group logs by batch
  const batches = new Map<string, any[]>()
  for (const log of logs) {
    const batchId = log.batch_id || 'no-batch'
    if (!batches.has(batchId)) {
      batches.set(batchId, [])
    }
    batches.get(batchId)!.push(log)
  }
  
  console.log(`Found ${logs.length} logs in ${batches.size} batches\n`)
  
  // Show logs by batch
  for (const [batchId, batchLogs] of batches) {
    console.log(`\n=== Batch: ${batchId} ===`)
    console.log(`Time: ${new Date(batchLogs[0].created_at).toLocaleString()}`)
    
    // Sort logs by time within batch
    batchLogs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    
    for (const log of batchLogs) {
      const time = new Date(log.created_at).toLocaleTimeString()
      console.log(`[${time}] [${log.level}] ${log.message}`)
      
      if (log.metadata) {
        const meta = log.metadata
        if (meta.workspaceId) console.log(`  Workspace: ${meta.workspaceId}`)
        if (meta.userId) console.log(`  User: ${meta.userId}`)
        if (meta.patternTypes) console.log(`  Pattern types: ${JSON.stringify(meta.patternTypes)}`)
        if (meta.relationshipCount !== undefined) console.log(`  Relationships: ${meta.relationshipCount}`)
        if (meta.patternCount !== undefined) console.log(`  Patterns: ${meta.patternCount}`)
        if (meta.entityCount !== undefined) console.log(`  Entities: ${meta.entityCount}`)
        if (meta.error) console.log(`  Error: ${meta.error}`)
      }
      
      if (log.error_stack) {
        console.log('  Stack trace:')
        const lines = log.error_stack.split('\n').slice(0, 3)
        lines.forEach(line => console.log(`    ${line}`))
      }
    }
  }
}

main().catch(console.error)