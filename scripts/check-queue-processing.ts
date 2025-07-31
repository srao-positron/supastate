#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zqlfxakbkwssxfynrmnk.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxbGZ4YWtia3dzc3hmeW5ybW5rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzEyNDMxMiwiZXhwIjoyMDY4NzAwMzEyfQ.Dvvga6Y4vu7xtorjzgQ3B4kjoJYvISQcnOEAIuoFSOU'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  console.log('=== Checking Queue Processing ===\n')
  
  // 1. Check pgmq queue status
  console.log('1. PGMQ Queue Status:')
  const { data: queueStatus, error: queueError } = await supabase.rpc('pgmq_metrics', { queue_name: 'memory_ingestion' })
  const { data: codeQueueStatus } = await supabase.rpc('pgmq_metrics', { queue_name: 'code_ingestion' })
  const { data: patternQueueStatus } = await supabase.rpc('pgmq_metrics', { queue_name: 'pattern_detection' })
  
  if (queueError) {
    console.error('Error checking queues:', queueError)
    return
  }
  
  const queues = [
    { name: 'memory_ingestion', data: queueStatus },
    { name: 'code_ingestion', data: codeQueueStatus },
    { name: 'pattern_detection', data: patternQueueStatus }
  ]
  
  for (const queue of queues) {
    if (queue.data) {
      console.log(`\n  ${queue.name}:`)
      console.log(`    Queue length: ${queue.data.queue_length}`)
      console.log(`    Newest msg age: ${queue.data.newest_msg_age_sec || 0}s`)
      console.log(`    Oldest msg age: ${queue.data.oldest_msg_age_sec || 0}s`)
      console.log(`    Total messages: ${queue.data.total_messages || 0}`)
    }
  }
  
  // 2. Check recent worker spawn logs
  console.log('\n\n2. Recent Worker Activity:')
  const { data: workerLogs } = await supabase
    .from('pattern_processor_logs')
    .select('created_at, message, metadata')
    .or('message.like.%worker spawn%,message.like.%coordinator%,message.like.%processed%')
    .gte('created_at', new Date(Date.now() - 2 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(10)
  
  if (workerLogs && workerLogs.length > 0) {
    for (const log of workerLogs) {
      const time = new Date(log.created_at).toLocaleTimeString()
      console.log(`  [${time}] ${log.message}`)
      if (log.metadata?.spawnCount) {
        console.log(`    Spawned: ${log.metadata.spawnCount} workers`)
      }
    }
  }
  
  // 3. Check for failed messages
  console.log('\n3. Recent Failed Messages:')
  const { data: failedLogs } = await supabase
    .from('pattern_processor_logs')
    .select('created_at, message, error_stack')
    .like('message', '%Failed to process message%')
    .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(5)
  
  if (failedLogs && failedLogs.length > 0) {
    const uniqueErrors = new Map()
    for (const log of failedLogs) {
      const errorType = log.error_stack?.split('\n')[0] || log.message
      if (!uniqueErrors.has(errorType)) {
        uniqueErrors.set(errorType, 0)
      }
      uniqueErrors.set(errorType, uniqueErrors.get(errorType) + 1)
    }
    
    console.log(`  Found ${failedLogs.length} failures:`)
    for (const [error, count] of uniqueErrors) {
      console.log(`    ${error} (${count} times)`)
    }
  }
  
  // 4. Check coordinator runs
  console.log('\n4. Recent Coordinator Runs:')
  const { data: coordLogs } = await supabase
    .from('pattern_processor_logs')
    .select('created_at, message, metadata')
    .like('message', '%coordinator started%')
    .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(10)
  
  if (coordLogs && coordLogs.length > 0) {
    // Count by type
    const coordCounts = new Map()
    for (const log of coordLogs) {
      const type = log.message.includes('Memory') ? 'Memory' : 
                   log.message.includes('Code') ? 'Code' : 
                   log.message.includes('Pattern') ? 'Pattern' : 'Unknown'
      coordCounts.set(type, (coordCounts.get(type) || 0) + 1)
    }
    
    for (const [type, count] of coordCounts) {
      console.log(`  ${type} coordinator: ${count} runs`)
    }
  }
}

main().catch(console.error)