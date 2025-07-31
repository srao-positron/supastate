#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkQueues() {
  console.log('=== Checking Queue Health ===\n')
  
  // Check queue health view
  const { data: queueHealth, error } = await supabase
    .from('queue_health')
    .select('*')
  
  if (error) {
    console.error('Error fetching queue health:', error)
  } else if (queueHealth && queueHealth.length > 0) {
    console.log('Queue Status:')
    for (const queue of queueHealth) {
      console.log(`\n📬 ${queue.queue_name}:`)
      console.log(`   Length: ${queue.queue_length || 0}`)
      console.log(`   Oldest message: ${queue.oldest_msg_age_sec || 0}s ago`)
      console.log(`   Total processed: ${queue.total_messages || 0}`)
    }
  } else {
    console.log('No queue health data available')
  }
  
  // Try to list queues directly
  console.log('\n=== Direct Queue Check ===')
  const { data: result, error: directError } = await supabase
    .rpc('pgmq_send', {
      queue_name: 'test_queue',
      msg: { test: true }
    })
    
  if (directError) {
    console.log('Queue system status:', directError.message)
  } else {
    console.log('Queue system is operational, test message ID:', result)
  }
  
  // Check for recent worker activity
  console.log('\n=== Recent Worker Activity ===')
  const { data: logs, error: logError } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .in('message', [
      'Memory ingestion worker started',
      'Code ingestion worker started',
      'Pattern detection worker started',
      'No messages in memory ingestion queue',
      'No messages in code ingestion queue',
      'No messages in pattern detection queue'
    ])
    .order('created_at', { ascending: false })
    .limit(20)
    
  if (logs && logs.length > 0) {
    console.log(`Found ${logs.length} worker logs:`)
    for (const log of logs) {
      const time = new Date(log.created_at).toLocaleTimeString()
      console.log(`[${time}] ${log.message}`)
    }
  } else {
    console.log('No recent worker activity found')
  }
}

checkQueues().catch(console.error)