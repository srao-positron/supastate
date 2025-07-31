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

async function fixStuckQueue() {
  console.log('🔧 Fixing stuck messages in github_code_parsing queue...\n')
  
  try {
    // Check initial metrics
    const { data: initialMetrics } = await supabase.rpc('pgmq_metrics', {
      p_queue_name: 'github_code_parsing'
    })
    
    if (initialMetrics && initialMetrics.length > 0) {
      console.log('📊 Initial Queue State:')
      console.log(`  Messages: ${initialMetrics[0].queue_length}`)
      console.log(`  Age: ${Math.round(initialMetrics[0].oldest_msg_age_sec / 60)} minutes\n`)
    }
    
    // Try to read with very long timeout
    console.log('📖 Reading messages with 1-hour visibility timeout...')
    const { data: messages, error: readError } = await supabase.rpc('pgmq_read', {
      queue_name: 'github_code_parsing',
      vt: 3600, // 1 hour
      qty: 10
    })
    
    if (readError) {
      console.error('Read error:', readError)
      
      // If read fails, try direct pgmq function call
      console.log('\n🔍 Trying direct pgmq function...')
      const { data: directRead } = await supabase.rpc('query_json', {
        query: `SELECT * FROM pgmq.read('github_code_parsing', 3600, 10)`
      })
      
      if (directRead) {
        console.log('Direct read result:', directRead)
      }
      
      return
    }
    
    // Parse the JSON response
    const parsedMessages = typeof messages === 'string' ? JSON.parse(messages) : messages
    const messageArray = Array.isArray(parsedMessages) ? parsedMessages : []
    
    if (messageArray.length === 0) {
      console.log('❌ No messages could be read')
      
      // Try to force-read with SQL
      console.log('\n🔍 Checking messages directly in table...')
      const { data: tableCheck } = await supabase.rpc('query_json', {
        query: `
          SELECT msg_id, vt, read_ct, enqueued_at, message
          FROM pgmq.github_code_parsing
          ORDER BY enqueued_at
          LIMIT 5
        `
      })
      
      if (tableCheck) {
        console.log('Direct table contents:', JSON.stringify(tableCheck, null, 2))
      }
      
      return
    }
    
    console.log(`\n✅ Found ${messageArray.length} messages`)
    
    // Delete each message individually
    console.log('\n🗑️  Deleting messages one by one...')
    let deletedCount = 0
    
    for (const msg of messageArray) {
      console.log(`  Deleting message ${msg.msg_id}...`)
      
      const { data: deleteResult, error: deleteError } = await supabase.rpc('pgmq_delete', {
        queue_name: 'github_code_parsing',
        msg_id: msg.msg_id
      })
      
      if (deleteError) {
        console.error(`    ❌ Failed to delete: ${deleteError.message}`)
        
        // Try archive instead
        const { data: archiveResult, error: archiveError } = await supabase.rpc('pgmq_archive', {
          queue_name: 'github_code_parsing',
          msg_id: msg.msg_id
        })
        
        if (!archiveError) {
          console.log(`    📦 Archived instead`)
          deletedCount++
        } else {
          console.error(`    ❌ Archive also failed: ${archiveError.message}`)
        }
      } else {
        console.log(`    ✅ Deleted successfully`)
        deletedCount++
      }
    }
    
    console.log(`\n🎯 Processed ${deletedCount} out of ${messageArray.length} messages`)
    
    // Check final metrics
    const { data: finalMetrics } = await supabase.rpc('pgmq_metrics', {
      p_queue_name: 'github_code_parsing'
    })
    
    if (finalMetrics && finalMetrics.length > 0) {
      console.log('\n📊 Final Queue State:')
      console.log(`  Messages: ${finalMetrics[0].queue_length}`)
    }
    
  } catch (error) {
    console.error('Error:', error)
  }
}

// Run the fix
fixStuckQueue()