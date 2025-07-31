#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zqlfxakbkwssxfynrmnk.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxbGZ4YWtia3dzc3hmeW5ybW5rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzEyNDMxMiwiZXhwIjoyMDY4NzAwMzEyfQ.Dvvga6Y4vu7xtorjzgQ3B4kjoJYvISQcnOEAIuoFSOU'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  console.log('=== Pattern Detection Worker Execution Logs ===\n')
  
  // Get all pattern processor logs from the last 5 minutes
  const { data: logs, error } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(100)
  
  if (error) {
    console.error('Error fetching logs:', error)
    return
  }
  
  // Filter for pattern detection related logs
  const patternLogs = logs?.filter(log => 
    log.message.includes('pattern') || 
    log.message.includes('Pattern') ||
    log.message.includes('memory-code') ||
    log.message.includes('Memory-code') ||
    log.message.includes('Processing') ||
    log.message.includes('detected') ||
    log.metadata?.functionName?.includes('detect')
  ) || []
  
  console.log(`Found ${patternLogs.length} pattern-related logs\n`)
  
  // Group by batch
  const batches = new Map<string, any[]>()
  for (const log of patternLogs) {
    const batchId = log.batch_id || 'no-batch'
    if (!batches.has(batchId)) {
      batches.set(batchId, [])
    }
    batches.get(batchId)!.push(log)
  }
  
  // Show logs by batch
  for (const [batchId, batchLogs] of batches) {
    if (batchId === 'no-batch' && batchLogs.length > 10) continue // Skip lots of no-batch logs
    
    console.log(`\n=== Batch: ${batchId} ===`)
    console.log(`Time: ${new Date(batchLogs[0].created_at).toLocaleString()}`)
    console.log(`Logs: ${batchLogs.length}\n`)
    
    for (const log of batchLogs.slice(0, 10)) { // Show first 10 logs
      const time = new Date(log.created_at).toLocaleTimeString()
      console.log(`[${time}] [${log.level}] ${log.message}`)
      
      if (log.metadata) {
        const meta = log.metadata
        if (meta.functionName) {
          console.log(`  Function: ${meta.functionName}`)
        }
        if (meta.workspaceId) {
          console.log(`  Workspace: ${meta.workspaceId}`)
        }
        if (meta.patternTypes) {
          console.log(`  Pattern types: ${meta.patternTypes}`)
        }
        if (meta.relationshipCount !== undefined) {
          console.log(`  Relationships: ${meta.relationshipCount}`)
        }
      }
      
      if (log.error_stack) {
        console.log(`  Error: ${log.error_stack.split('\n')[0]}`)
      }
    }
  }
  
  // Check if pattern detection is actually running
  const workerStarts = patternLogs.filter(log => 
    log.message.includes('Pattern detection worker started')
  )
  const processingLogs = patternLogs.filter(log => 
    log.message.includes('Processing') && 
    log.message.includes('pattern detection messages')
  )
  
  console.log('\n=== Summary ===')
  console.log(`Worker starts: ${workerStarts.length}`)
  console.log(`Processing logs: ${processingLogs.length}`)
  console.log(`Memory-code logs: ${patternLogs.filter(log => log.message.includes('memory-code')).length}`)
}

main().catch(console.error)