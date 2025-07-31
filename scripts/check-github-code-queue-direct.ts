#!/usr/bin/env npx tsx

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  },
  db: {
    schema: 'public'
  }
})

async function checkGithubCodeQueue() {
  console.log('🔍 Checking github_code_parsing PGMQ queue...\n')

  try {
    // First check if we have the wrapper functions
    console.log('📋 Checking for PGMQ wrapper functions...')
    
    // Try pgmq_send
    const { error: sendError } = await supabase.rpc('pgmq_send')
    console.log('pgmq_send exists:', !sendError || !sendError.message.includes('not find'))
    
    // Try pgmq_send_batch
    const { error: batchError } = await supabase.rpc('pgmq_send_batch')
    console.log('pgmq_send_batch exists:', !batchError || !batchError.message.includes('not find'))
    
    // Try pgmq_read
    const { error: readError } = await supabase.rpc('pgmq_read')
    console.log('pgmq_read exists:', !readError || !readError.message.includes('not find'))
    
    // Try pgmq_delete
    const { error: deleteError } = await supabase.rpc('pgmq_delete')
    console.log('pgmq_delete exists:', !deleteError || !deleteError.message.includes('not find'))
    
    // Try pgmq_archive
    const { error: archiveError } = await supabase.rpc('pgmq_archive')
    console.log('pgmq_archive exists:', !archiveError || !archiveError.message.includes('not find'))

    // Try pgmq_create
    const { error: createError } = await supabase.rpc('pgmq_create')
    console.log('pgmq_create exists:', !createError || !createError.message.includes('not find'))

    // Check queue tables directly
    console.log('\n📋 Checking queue tables...')
    
    // Check specific queue functions
    const queueFunctions = [
      'queue_code_ingestion_job',
      'queue_memory_ingestion_job',
      'queue_pattern_detection_job',
      'read_code_ingestion_job',
      'read_memory_ingestion_job',
      'read_pattern_detection_job'
    ]
    
    for (const func of queueFunctions) {
      const { error } = await supabase.rpc(func)
      console.log(`${func} exists:`, !error || !error.message.includes('not find'))
    }
    
    // Try to send a test message to github_code_parsing queue
    console.log('\n🧪 Testing github_code_parsing queue operations...')
    
    // Try sending a message
    const testMessage = {
      type: 'test',
      timestamp: new Date().toISOString(),
      data: 'Testing queue'
    }
    
    console.log('Attempting to send test message...')
    const { data: sendData, error: sendMsgError } = await supabase.rpc('pgmq_send', {
      p_queue_name: 'github_code_parsing',
      p_message: testMessage
    })
    
    if (sendMsgError) {
      console.log('Send error:', sendMsgError.message)
    } else {
      console.log('Message sent successfully, ID:', sendData)
    }
    
    // Try reading messages
    console.log('\nAttempting to read messages...')
    const { data: readData, error: readMsgError } = await supabase.rpc('pgmq_read', {
      p_queue_name: 'github_code_parsing',
      p_vt: 30,
      p_qty: 5
    })
    
    if (readMsgError) {
      console.log('Read error:', readMsgError.message)
    } else if (readData && readData.length > 0) {
      console.log(`\n📦 Found ${readData.length} messages:`)
      readData.forEach((msg: any, i: number) => {
        console.log(`\n  Message ${i + 1}:`)
        console.log(`    ID: ${msg.msg_id}`)
        console.log(`    Read Count: ${msg.read_ct}`)
        console.log(`    Enqueued: ${msg.enqueued_at}`)
        console.log(`    Message: ${JSON.stringify(msg.message)}`)
      })
    } else {
      console.log('No messages found in queue')
    }
    
    // Check metrics
    console.log('\n📊 Checking queue metrics...')
    const { data: metrics, error: metricsError } = await supabase.rpc('pgmq_metrics', {
      p_queue_name: 'github_code_parsing'
    })
    
    if (metricsError) {
      console.log('Metrics error:', metricsError.message)
    } else if (metrics && metrics.length > 0) {
      const m = metrics[0]
      console.log('Queue Metrics:')
      console.log(`  - Queue Length: ${m.queue_length || 0}`)
      console.log(`  - Total Messages: ${m.total_messages || 0}`)
      console.log(`  - Newest Msg Age: ${m.newest_msg_age_sec ? `${m.newest_msg_age_sec}s` : 'N/A'}`)
      console.log(`  - Oldest Msg Age: ${m.oldest_msg_age_sec ? `${m.oldest_msg_age_sec}s` : 'N/A'}`)
    }
    
  } catch (error) {
    console.error('Unexpected error:', error)
  }
}

// Run the check
checkGithubCodeQueue()