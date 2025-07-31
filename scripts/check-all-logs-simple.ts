#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zqlfxakbkwssxfynrmnk.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxbGZ4YWtia3dzc3hmeW5ybW5rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzEyNDMxMiwiZXhwIjoyMDY4NzAwMzEyfQ.Dvvga6Y4vu7xtorjzgQ3B4kjoJYvISQcnOEAIuoFSOU'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  console.log('=== ALL Recent Logs (Simple Query) ===\n')
  
  // Just get ALL recent logs, no filtering
  const { data: logs, error } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(100)
  
  if (error) {
    console.error('Query error:', error)
    return
  }
  
  console.log(`Found ${logs?.length || 0} logs in last 5 minutes\n`)
  
  if (!logs || logs.length === 0) {
    console.log('No logs found!')
    return
  }
  
  // Group by batch_id to see what's running
  const batches = new Map<string, { count: number, sample: string }>()
  
  for (const log of logs) {
    const batchId = log.batch_id || 'NO_BATCH'
    if (!batches.has(batchId)) {
      batches.set(batchId, { count: 0, sample: log.message })
    }
    batches.get(batchId)!.count++
  }
  
  console.log('Logs by batch_id:')
  const sortedBatches = Array.from(batches.entries()).sort((a, b) => b[1].count - a[1].count)
  for (const [batchId, info] of sortedBatches.slice(0, 10)) {
    console.log(`  ${batchId}: ${info.count} logs`)
    console.log(`    Sample: "${info.sample.substring(0, 80)}..."`)
  }
  
  // Look for anything code-related
  console.log('\n\nLogs containing "code" (any case):')
  const codeLogs = logs.filter(log => 
    log.message?.toLowerCase().includes('code') ||
    log.batch_id?.toLowerCase().includes('code') ||
    JSON.stringify(log.metadata || {}).toLowerCase().includes('code')
  )
  
  console.log(`Found ${codeLogs.length} code-related logs`)
  
  if (codeLogs.length > 0) {
    console.log('\nFirst 10 code-related logs:')
    for (const log of codeLogs.slice(0, 10)) {
      const time = new Date(log.created_at).toLocaleTimeString()
      console.log(`\n[${time}] Batch: ${log.batch_id || 'none'}`)
      console.log(`Level: ${log.level}`)
      console.log(`Message: ${log.message}`)
      if (log.metadata && Object.keys(log.metadata).length > 0) {
        console.log(`Metadata: ${JSON.stringify(log.metadata).substring(0, 100)}...`)
      }
    }
  }
  
  // Show all unique batch_ids
  console.log('\n\nAll unique batch_ids:')
  const uniqueBatchIds = new Set(logs.map(log => log.batch_id).filter(Boolean))
  for (const batchId of Array.from(uniqueBatchIds).sort()) {
    console.log(`  - ${batchId}`)
  }
}

main().catch(console.error)