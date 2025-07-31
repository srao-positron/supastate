#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zqlfxakbkwssxfynrmnk.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxbGZ4YWtia3dzc3hmeW5ybW5rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzEyNDMxMiwiZXhwIjoyMDY4NzAwMzEyfQ.Dvvga6Y4vu7xtorjzgQ3B4kjoJYvISQcnOEAIuoFSOU'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  console.log('=== Memory-Code Log Details ===\n')
  
  // Get logs about memory processing
  const { data: logs, error } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .or('message.like.%Found % memories to process%,message.like.%No memories found%,message.like.%Failed to process memory%')
    .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(30)
  
  if (error) {
    console.error('Error fetching logs:', error)
    return
  }
  
  if (!logs || logs.length === 0) {
    console.log('No relevant logs found')
    return
  }
  
  console.log(`Found ${logs.length} relevant logs:\n`)
  
  // Show logs
  for (const log of logs) {
    const time = new Date(log.created_at).toLocaleTimeString()
    console.log(`[${time}] [${log.level}] ${log.message}`)
    
    if (log.metadata) {
      const meta = log.metadata
      if (meta.functionName) console.log(`  Function: ${meta.functionName}`)
      if (meta.tenantFilter) console.log(`  Tenant filter: ${meta.tenantFilter}`)
      if (meta.workspaceId) console.log(`  Workspace: ${meta.workspaceId}`)
      if (meta.userId) console.log(`  User: ${meta.userId}`)
      if (meta.memoryCount !== undefined) console.log(`  Memory count: ${meta.memoryCount}`)
      if (meta.error) console.log(`  Error: ${meta.error}`)
    }
    
    if (log.error_stack) {
      console.log('  Stack trace:')
      const lines = log.error_stack.split('\n').slice(0, 2)
      lines.forEach(line => console.log(`    ${line}`))
    }
    
    console.log()
  }
}

main().catch(console.error)