#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zqlfxakbkwssxfynrmnk.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxbGZ4YWtia3dzc3hmeW5ybW5rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzEyNDMxMiwiZXhwIjoyMDY4NzAwMzEyfQ.Dvvga6Y4vu7xtorjzgQ3B4kjoJYvISQcnOEAIuoFSOU'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  const batchId = '61000b8a-f5a5-4954-8afe-310866ed6738' // Most common batch ID
  
  console.log(`=== Checking Batch ${batchId} ===\n`)
  
  // Get all logs for this batch
  const { data: logs } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .eq('batch_id', batchId)
    .order('created_at', { ascending: true })
  
  if (!logs || logs.length === 0) {
    console.log('No logs found for this batch')
    return
  }
  
  console.log(`Found ${logs.length} logs for this batch\n`)
  
  // Analyze the batch
  const functionName = logs[0]?.metadata?.functionName || 'unknown'
  console.log(`Function: ${functionName}`)
  console.log(`Time range: ${new Date(logs[0].created_at).toLocaleTimeString()} - ${new Date(logs[logs.length - 1].created_at).toLocaleTimeString()}`)
  
  // Count log levels
  const levels = { info: 0, warn: 0, error: 0, debug: 0 }
  for (const log of logs) {
    levels[log.level] = (levels[log.level] || 0) + 1
  }
  console.log(`\nLog levels: info=${levels.info}, warn=${levels.warn}, error=${levels.error}, debug=${levels.debug}`)
  
  // Show first few and last few logs
  console.log('\nFirst 5 logs:')
  for (const log of logs.slice(0, 5)) {
    const time = new Date(log.created_at).toLocaleTimeString()
    console.log(`  [${time}] ${log.message}`)
  }
  
  console.log('\nLast 5 logs:')
  for (const log of logs.slice(-5)) {
    const time = new Date(log.created_at).toLocaleTimeString()
    console.log(`  [${time}] ${log.message}`)
  }
  
  // Check for errors
  const errors = logs.filter(log => log.level === 'error')
  if (errors.length > 0) {
    console.log(`\n${errors.length} Errors found:`)
    for (const error of errors.slice(0, 3)) {
      console.log(`  ${error.message}`)
      if (error.error_stack) {
        console.log(`    ${error.error_stack.split('\n')[0]}`)
      }
    }
  }
  
  // Look for code-related messages
  const codeRelated = logs.filter(log => 
    log.message.toLowerCase().includes('code') || 
    log.metadata?.code_entity_id
  )
  
  console.log(`\n${codeRelated.length} code-related logs found`)
  if (codeRelated.length > 0) {
    console.log('Sample code-related logs:')
    for (const log of codeRelated.slice(0, 5)) {
      console.log(`  ${log.message}`)
      if (log.metadata?.code_entity_id) {
        console.log(`    Entity: ${log.metadata.code_entity_id}`)
      }
    }
  }
}

main().catch(console.error)