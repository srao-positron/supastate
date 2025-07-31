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

async function consumeAllMessages() {
  console.log('🧹 Consuming all messages from github_code_parsing queue...\n')
  
  let totalConsumed = 0
  
  try {
    while (true) {
      // Read and consume messages with a long visibility timeout
      const { data: messages, error: readError } = await supabase.rpc('pgmq_read', {
        queue_name: 'github_code_parsing',
        vt: 3600, // 1 hour visibility timeout
        qty: 10
      })
      
      if (readError) {
        console.error('Error reading messages:', readError)
        break
      }
      
      if (!messages || messages.length === 0) {
        console.log('No more messages in queue')
        break
      }
      
      console.log(`Found ${messages.length} messages to consume...`)
      
      // Delete each message
      for (const msg of messages) {
        const { error: deleteError } = await supabase.rpc('pgmq_delete', {
          queue_name: 'github_code_parsing',
          msg_id: msg.msg_id
        })
        
        if (deleteError) {
          console.error(`Failed to delete message ${msg.msg_id}:`, deleteError)
        } else {
          console.log(`✅ Deleted message ${msg.msg_id}`)
          totalConsumed++
        }
      }
    }
    
    console.log(`\n✅ Total messages consumed: ${totalConsumed}`)
    
    // Check final queue status
    const { data: metrics, error: metricsError } = await supabase.rpc('pgmq_metrics', {
      queue_name: 'github_code_parsing'
    })
    
    if (!metricsError && metrics) {
      console.log('\n📊 Final queue status:')
      console.log(`Queue length: ${metrics.queue_length}`)
      console.log(`Total messages: ${metrics.total_messages}`)
    }
    
  } catch (error) {
    console.error('Error:', error)
  }
}

// Run the consumption
consumeAllMessages()