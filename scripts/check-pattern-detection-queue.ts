#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zqlfxakbkwssxfynrmnk.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxbGZ4YWtia3dzc3hmeW5ybW5rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzEyNDMxMiwiZXhwIjoyMDY4NzAwMzEyfQ.Dvvga6Y4vu7xtorjzgQ3B4kjoJYvISQcnOEAIuoFSOU'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  console.log('=== Pattern Detection Queue Status ===\n')
  
  // Check queue metrics
  const { data: metrics, error: metricsError } = await supabase
    .rpc('pgmq_metrics', { queue_name: 'pattern_detection' })
  
  if (metricsError) {
    console.error('Error getting queue metrics:', metricsError)
  } else if (metrics) {
    console.log('Queue Metrics:')
    console.log(`  Queue length: ${metrics.queue_length}`)
    console.log(`  Newest message age: ${metrics.newest_msg_age_sec}s`)
    console.log(`  Oldest message age: ${metrics.oldest_msg_age_sec}s`)
    console.log(`  Total messages: ${metrics.total_messages}`)
  }
  
  // Peek at messages in queue
  console.log('\n=== Messages in Queue ===')
  
  const { data: messages, error: peekError } = await supabase
    .rpc('pgmq_peek', {
      queue_name: 'pattern_detection',
      qty: 5
    })
  
  if (peekError) {
    console.error('Error peeking queue:', peekError)
  } else if (messages && messages.length > 0) {
    console.log(`Found ${messages.length} messages:\n`)
    for (const msg of messages) {
      console.log(`Message ID: ${msg.msg_id}`)
      console.log(`  Enqueued: ${new Date(msg.enqueued_at).toLocaleString()}`)
      console.log(`  Read count: ${msg.read_ct}`)
      console.log(`  Message:`)
      console.log(`    Batch ID: ${msg.message.batch_id}`)
      console.log(`    Pattern types: ${msg.message.pattern_types?.join(', ')}`)
      console.log(`    Workspace ID: ${msg.message.workspace_id}`)
      console.log(`    Limit: ${msg.message.limit}`)
      console.log()
    }
  } else {
    console.log('No messages in queue')
  }
  
  // Check recent pattern detection logs
  console.log('\n=== Recent Pattern Detection Worker Logs ===')
  
  const { data: logs, error: logsError } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .eq('message', 'Pattern detection worker started')
    .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(5)
  
  if (logsError) {
    console.error('Error fetching logs:', logsError)
  } else if (logs && logs.length > 0) {
    console.log(`Found ${logs.length} worker starts:\n`)
    for (const log of logs) {
      console.log(`[${new Date(log.created_at).toLocaleString()}] ${log.message}`)
      if (log.metadata?.batchId) {
        console.log(`  Batch ID: ${log.metadata.batchId}`)
      }
    }
  } else {
    console.log('No recent worker starts found')
  }
}

main().catch(console.error)