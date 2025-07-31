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

async function diagnoseQueue() {
  console.log('🔍 Diagnosing github_code_parsing queue...\n')
  
  try {
    // 1. Check metrics
    const { data: metrics, error: metricsError } = await supabase.rpc('pgmq_metrics', {
      p_queue_name: 'github_code_parsing'
    })
    
    if (!metricsError && metrics && metrics.length > 0) {
      const m = metrics[0]
      console.log('📊 Queue Metrics:')
      console.log(`  Queue Length: ${m.queue_length || 0}`)
      console.log(`  Total Messages: ${m.total_messages || 0}`)
      console.log(`  Message Age: ${m.oldest_msg_age_sec ? `${Math.round(m.oldest_msg_age_sec / 60)} minutes` : 'N/A'}`)
      console.log('')
    }
    
    // 2. Try different read approaches
    console.log('🔍 Attempting different read approaches...\n')
    
    // Try with very long visibility timeout
    console.log('1. Reading with 24-hour visibility timeout...')
    const { data: longVtMessages, error: longVtError } = await supabase.rpc('pgmq_read', {
      queue_name: 'github_code_parsing',
      vt: 86400, // 24 hours
      qty: 10
    })
    
    if (!longVtError && longVtMessages && longVtMessages.length > 0) {
      console.log(`✅ Found ${longVtMessages.length} messages with long VT`)
      
      // Show message details
      longVtMessages.forEach((msg: any, idx: number) => {
        console.log(`\nMessage ${idx + 1}:`)
        console.log(`  ID: ${msg.msg_id}`)
        console.log(`  Read Count: ${msg.read_ct}`)
        console.log(`  Enqueued: ${new Date(msg.enqueued_at).toISOString()}`)
        if (msg.message) {
          console.log(`  Repository: ${msg.message.repository_id || 'unknown'}`)
          console.log(`  File: ${msg.message.file_path || 'unknown'}`)
        }
      })
      
      // Now delete these messages
      console.log('\n🗑️  Deleting stuck messages...')
      const msgIds = longVtMessages.map(m => m.msg_id)
      const { error: deleteError } = await supabase.rpc('pgmq_delete', {
        queue_name: 'github_code_parsing',
        msg_ids: msgIds
      })
      
      if (deleteError) {
        console.error('Delete error:', deleteError)
      } else {
        console.log(`✅ Deleted ${msgIds.length} messages`)
      }
    } else {
      console.log('❌ No messages found with long VT')
      if (longVtError) {
        console.error('Error:', longVtError.message)
      }
    }
    
    // 3. Check if messages are in archive
    console.log('\n📚 Checking archive table...')
    try {
      const { count, error: archiveError } = await supabase
        .from('pgmq.a_github_code_parsing')
        .select('*', { count: 'exact', head: true })
      
      if (!archiveError) {
        console.log(`Archive contains ${count || 0} messages`)
      }
    } catch (e) {
      console.log('Archive table not accessible or does not exist')
    }
    
    // 4. Final metrics check
    console.log('\n📊 Final Queue Metrics:')
    const { data: finalMetrics, error: finalError } = await supabase.rpc('pgmq_metrics', {
      p_queue_name: 'github_code_parsing'
    })
    
    if (!finalError && finalMetrics && finalMetrics.length > 0) {
      const m = finalMetrics[0]
      console.log(`  Queue Length: ${m.queue_length || 0}`)
      console.log(`  Total Messages: ${m.total_messages || 0}`)
    }
    
  } catch (error) {
    console.error('Error:', error)
  }
}

// Run diagnosis
diagnoseQueue()