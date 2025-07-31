#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

async function checkQueueStatus() {
  console.log('=== CHECKING QUEUE STATUS ===\n')
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  // Check queue depths
  console.log('📊 QUEUE DEPTHS:')
  const queues = ['memory_ingestion', 'pattern_detection', 'code_ingestion', 'summary_generation']
  
  for (const queue of queues) {
    try {
      // Get queue metrics
      const { data: metrics } = await supabase.rpc('pgmq_metrics', { queue_name: queue })
      if (metrics) {
        console.log(`\n${queue}:`)
        console.log(`  Total messages: ${metrics.queue_length || 0}`)
        console.log(`  Oldest message age: ${metrics.oldest_msg_age_sec || 0} seconds`)
        console.log(`  Newest message age: ${metrics.newest_msg_age_sec || 0} seconds`)
      }
    } catch (e) {
      console.log(`\n${queue}: Not found or error`)
    }
  }
  
  // Check a sample message from memory_ingestion
  console.log('\n\n📨 SAMPLE MESSAGE FROM memory_ingestion:')
  const { data: sample } = await supabase.rpc('pgmq_read', {
    queue_name: 'memory_ingestion',
    vt: 0,
    qty: 1
  })
  
  if (sample && sample.length > 0) {
    console.log('Message ID:', sample[0].msg_id)
    console.log('Enqueued at:', new Date(sample[0].enqueued_at).toLocaleString())
    console.log('Read count:', sample[0].read_ct)
    console.log('Message type:', sample[0].message?.type)
  }
  
  // Check if workers are erroring
  console.log('\n\n🔍 RECENT PATTERN LOGS:')
  const { data: logs } = await supabase
    .from('pattern_processor_logs')
    .select('level, message, created_at, metadata')
    .order('created_at', { ascending: false })
    .limit(10)
    
  if (logs && logs.length > 0) {
    for (const log of logs) {
      const time = new Date(log.created_at).toLocaleTimeString()
      console.log(`[${time}] [${log.level}] ${log.message}`)
      if (log.metadata && Object.keys(log.metadata).length > 0) {
        console.log('  Metadata:', JSON.stringify(log.metadata))
      }
    }
  } else {
    console.log('No recent logs found')
  }
  
  // Check if code_processing_queue has items
  console.log('\n\n📁 CODE PROCESSING STATUS:')
  const { count: codeQueueCount } = await supabase
    .from('code_processing_queue')
    .select('*', { count: 'exact', head: true })
  console.log(`code_processing_queue table: ${codeQueueCount} items`)
  
  const { count: codeFileCount } = await supabase
    .from('code_files')
    .select('*', { count: 'exact', head: true })
  console.log(`code_files table: ${codeFileCount} files`)
}

checkQueueStatus().catch(console.error)