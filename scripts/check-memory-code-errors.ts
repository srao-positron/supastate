#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zqlfxakbkwssxfynrmnk.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxbGZ4YWtia3dzc3hmeW5ybW5rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzEyNDMxMiwiZXhwIjoyMDY4NzAwMzEyfQ.Dvvga6Y4vu7xtorjzgQ3B4kjoJYvISQcnOEAIuoFSOU'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  console.log('=== Checking Memory-Code Relationship Errors ===\n')
  
  // Get recent error logs
  const { data: logs, error } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .or('message.like.%Memory-code relationship detection failed%,message.like.%detectMemoryCodeRelationships%')
    .order('created_at', { ascending: false })
    .limit(10)
  
  if (error) {
    console.error('Error fetching logs:', error)
    return
  }
  
  if (!logs || logs.length === 0) {
    console.log('No error logs found for memory-code relationship detection')
    return
  }
  
  console.log(`Found ${logs.length} error logs:\n`)
  
  for (const log of logs) {
    console.log(`[${new Date(log.created_at).toLocaleTimeString()}] ${log.message}`)
    if (log.metadata?.error) {
      console.log(`  Error: ${log.metadata.error}`)
    }
    if (log.error_stack) {
      console.log(`  Stack trace:`)
      const stackLines = log.error_stack.split('\n').slice(0, 5)
      stackLines.forEach(line => console.log(`    ${line}`))
    }
    console.log()
  }
}

main().catch(console.error)