#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

async function checkIngestionErrors() {
  console.log('=== CHECKING INGESTION ERRORS ===\n')
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  // Check pattern processor logs for errors
  console.log('🔍 RECENT ERROR LOGS:')
  const { data: errorLogs } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .eq('level', 'error')
    .order('created_at', { ascending: false })
    .limit(10)
    
  if (errorLogs && errorLogs.length > 0) {
    for (const log of errorLogs) {
      console.log(`\n[${new Date(log.created_at).toLocaleString()}] ${log.message}`)
      if (log.details) {
        console.log('Details:', JSON.stringify(log.details, null, 2))
      }
      if (log.error_stack) {
        console.log('Stack:', log.error_stack)
      }
    }
  } else {
    console.log('No error logs found')
  }
  
  // Check for failed messages in DLQ
  console.log('\n\n📨 DEAD LETTER QUEUE:')
  const { data: dlqMessages } = await supabase.rpc('pgmq_read', {
    queue_name: 'memory_ingestion_dlq',
    vt: 0,
    qty: 5
  })
  
  if (dlqMessages && dlqMessages.length > 0) {
    console.log(`Found ${dlqMessages.length} messages in DLQ`)
    for (const msg of dlqMessages) {
      console.log(`\nMessage ${msg.msg_id}:`)
      console.log('Enqueued:', new Date(msg.enqueued_at).toLocaleString())
      console.log('Read count:', msg.read_ct)
    }
  } else {
    console.log('No messages in DLQ')
  }
  
  // Check a sample message that's been read many times
  console.log('\n\n🔄 HIGH READ COUNT MESSAGES:')
  const { data: stuckMessages } = await supabase.rpc('pgmq_read', {
    queue_name: 'memory_ingestion',
    vt: 0,
    qty: 100
  })
  
  if (stuckMessages && stuckMessages.length > 0) {
    const highReadMessages = stuckMessages.filter(m => m.read_ct > 5)
    console.log(`Found ${highReadMessages.length} messages with read_ct > 5`)
    
    if (highReadMessages.length > 0) {
      const sample = highReadMessages[0]
      console.log(`\nSample message (ID: ${sample.msg_id})`)
      console.log('Read count:', sample.read_ct)
      console.log('Memory ID:', sample.message.memory_id)
      console.log('User ID:', sample.message.user_id)
      console.log('Workspace ID:', sample.message.workspace_id)
    }
  }
}

checkIngestionErrors().catch(console.error)