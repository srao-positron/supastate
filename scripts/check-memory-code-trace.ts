#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zqlfxakbkwssxfynrmnk.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxbGZ4YWtia3dzc3hmeW5ybW5rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzEyNDMxMiwiZXhwIjoyMDY4NzAwMzEyfQ.Dvvga6Y4vu7xtorjzgQ3B4kjoJYvISQcnOEAIuoFSOU'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  console.log('=== Memory-Code Detection Trace ===\n')
  
  // Get the most recent batch with memory-code detection
  const { data: recentBatches, error: batchError } = await supabase
    .from('pattern_processor_logs')
    .select('batch_id')
    .like('message', '%memory-code%')
    .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(5)
  
  if (batchError || !recentBatches || recentBatches.length === 0) {
    console.log('No recent memory-code batches found')
    return
  }
  
  const batchId = recentBatches[0].batch_id
  console.log(`Tracing batch: ${batchId}\n`)
  
  // Get all logs for this batch
  const { data: batchLogs, error: logsError } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .eq('batch_id', batchId)
    .order('created_at', { ascending: true })
  
  if (logsError || !batchLogs) {
    console.error('Error fetching batch logs:', logsError)
    return
  }
  
  console.log(`Found ${batchLogs.length} logs for this batch:\n`)
  
  // Show the execution flow
  for (const log of batchLogs) {
    const time = new Date(log.created_at).toLocaleTimeString()
    const indent = log.metadata?.functionName ? '  ' : ''
    
    console.log(`${indent}[${time}] [${log.level}] ${log.message}`)
    
    if (log.metadata) {
      const meta = log.metadata
      if (meta.functionName) console.log(`${indent}  Function: ${meta.functionName}`)
      if (meta.workspaceId) console.log(`${indent}  Workspace: ${meta.workspaceId}`)
      if (meta.userId) console.log(`${indent}  User: ${meta.userId}`)
      if (meta.patternTypes) console.log(`${indent}  Pattern types: ${JSON.stringify(meta.patternTypes)}`)
      if (meta.relationshipCount !== undefined) console.log(`${indent}  Relationships: ${meta.relationshipCount}`)
      if (meta.entityCount !== undefined) console.log(`${indent}  Entities: ${meta.entityCount}`)
    }
    
    if (log.error_stack) {
      console.log(`${indent}  Error: ${log.error_stack.split('\n')[0]}`)
    }
  }
  
  // Check if workspace context is being passed correctly
  console.log('\n=== Workspace Context Check ===')
  
  const contextLogs = batchLogs.filter(log => 
    log.metadata?.workspaceId || log.metadata?.userId
  )
  
  if (contextLogs.length > 0) {
    console.log('Workspace/User context found in logs:')
    for (const log of contextLogs.slice(0, 3)) {
      console.log(`  Workspace: ${log.metadata.workspaceId}, User: ${log.metadata.userId}`)
    }
  } else {
    console.log('❌ No workspace/user context found in logs!')
  }
}

main().catch(console.error)