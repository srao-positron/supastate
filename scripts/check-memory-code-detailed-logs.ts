#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zqlfxakbkwssxfynrmnk.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxbGZ4YWtia3dzc3hmeW5ybW5rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzEyNDMxMiwiZXhwIjoyMDY4NzAwMzEyfQ.Dvvga6Y4vu7xtorjzgQ3B4kjoJYvISQcnOEAIuoFSOU'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  console.log('=== Detailed Memory-Code Detection Logs ===\n')
  
  // Get recent logs related to memory-code detection
  const { data: logs, error } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .or('message.like.%memory-code%,message.like.%Memory-code%,message.like.%detectMemoryCodeRelationships%')
    .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(50)
  
  if (error) {
    console.error('Error fetching logs:', error)
    return
  }
  
  if (!logs || logs.length === 0) {
    console.log('No memory-code logs found')
    return
  }
  
  // Group logs by function execution
  const executions = new Map<string, any[]>()
  let currentExecution = null
  
  for (const log of logs) {
    if (log.message.includes('Starting memory-code')) {
      currentExecution = log.created_at
    }
    
    if (currentExecution) {
      if (!executions.has(currentExecution)) {
        executions.set(currentExecution, [])
      }
      executions.get(currentExecution)!.push(log)
    }
  }
  
  console.log(`Found ${executions.size} memory-code detection executions\n`)
  
  // Show details of most recent executions
  let count = 0
  for (const [timestamp, executionLogs] of executions) {
    if (count++ >= 3) break // Show only 3 most recent
    
    console.log(`\n=== Execution at ${new Date(timestamp).toLocaleString()} ===`)
    
    for (const log of executionLogs.reverse()) {
      const time = new Date(log.created_at).toLocaleTimeString()
      console.log(`[${time}] [${log.level}] ${log.message}`)
      
      if (log.metadata) {
        const meta = log.metadata
        if (meta.workspaceId) console.log(`  Workspace: ${meta.workspaceId}`)
        if (meta.userId) console.log(`  User: ${meta.userId}`)
        if (meta.relationshipCount !== undefined) console.log(`  Relationships created: ${meta.relationshipCount}`)
        if (meta.entityCount !== undefined) console.log(`  Entities processed: ${meta.entityCount}`)
        if (meta.error) console.log(`  Error: ${meta.error}`)
      }
      
      if (log.error_stack) {
        console.log('  Stack trace:')
        const lines = log.error_stack.split('\n').slice(0, 3)
        lines.forEach(line => console.log(`    ${line}`))
      }
    }
  }
  
  // Check for pattern types being run
  console.log('\n=== Pattern Types Requested ===')
  
  const patternTypeLogs = logs.filter(log => 
    log.message.includes('Running pattern detection for types')
  )
  
  for (const log of patternTypeLogs.slice(0, 5)) {
    console.log(`[${new Date(log.created_at).toLocaleTimeString()}] ${log.message}`)
    if (log.metadata?.patternTypes) {
      console.log(`  Types: ${log.metadata.patternTypes}`)
    }
  }
}

main().catch(console.error)