#!/usr/bin/env npx tsx

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function checkQueue() {
  console.log('🔍 Simple queue check for github_code_parsing...\n')
  
  // Check metrics with correct parameter name
  const { data: metrics, error: metricsError } = await supabase.rpc('pgmq_metrics', {
    p_queue_name: 'github_code_parsing'
  })
  
  if (metricsError) {
    console.error('Metrics error:', metricsError)
  } else if (metrics && metrics.length > 0) {
    console.log('Queue Metrics:', metrics[0])
  }
  
  // Try to read and immediately delete to clear stuck messages
  console.log('\n📦 Attempting to read and clear messages...')
  const { data: messages, error: readError } = await supabase.rpc('pgmq_read', {
    queue_name: 'github_code_parsing',
    vt: 10,
    qty: 10
  })
  
  if (readError) {
    console.error('Read error:', readError)
  } else if (messages && messages.length > 0) {
    console.log(`Found ${messages.length} messages`)
    
    // Delete them to clear the queue
    const msgIds = messages.map(m => m.msg_id)
    const { error: deleteError } = await supabase.rpc('pgmq_delete', {
      queue_name: 'github_code_parsing',
      msg_ids: msgIds
    })
    
    if (deleteError) {
      console.error('Delete error:', deleteError)
    } else {
      console.log(`✅ Cleared ${msgIds.length} messages from the queue`)
    }
  } else {
    console.log('No messages found to clear')
  }
  
  // Check metrics again
  const { data: metricsAfter, error: metricsAfterError } = await supabase.rpc('pgmq_metrics', {
    p_queue_name: 'github_code_parsing'
  })
  
  if (!metricsAfterError && metricsAfter && metricsAfter.length > 0) {
    console.log('\nQueue Metrics After:', metricsAfter[0])
  }
}

checkQueue().catch(console.error)