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
  }
})

async function checkQueues() {
  console.log('🔍 Checking PGMQ queues...\n')

  try {
    // List all queues
    const { data: queues, error: listError } = await supabase.rpc('pgmq_list_queues')
    
    if (listError) {
      console.error('Error listing queues:', listError)
      return
    }

    console.log('📋 Available PGMQ queues:')
    if (queues && queues.length > 0) {
      for (const queue of queues) {
        console.log(`\n  Queue: ${queue.queue_name}`)
        
        // Get metrics for each queue
        const { data: metrics, error: metricsError } = await supabase.rpc('pgmq_metrics', {
          p_queue_name: queue.queue_name
        })
        
        if (!metricsError && metrics && metrics.length > 0) {
          const m = metrics[0]
          console.log(`    - Length: ${m.queue_length || 0}`)
          console.log(`    - Total Messages: ${m.total_messages || 0}`)
          console.log(`    - Newest Msg Age: ${m.newest_msg_age_sec ? `${m.newest_msg_age_sec}s` : 'N/A'}`)
          console.log(`    - Oldest Msg Age: ${m.oldest_msg_age_sec ? `${m.oldest_msg_age_sec}s` : 'N/A'}`)
        }
      }
    } else {
      console.log('  No queues found')
    }

    // Specifically check for github_code_parsing queue
    console.log('\n\n🔍 Checking specifically for github_code_parsing queue...')
    
    const githubQueueExists = queues?.some(q => q.queue_name === 'github_code_parsing')
    
    if (githubQueueExists) {
      console.log('✅ Queue "github_code_parsing" exists')
      
      // Try to check messages using SQL directly
      const { data, error } = await supabase.rpc('query_json', {
        query: `
          SELECT COUNT(*) as message_count
          FROM pgmq.github_code_parsing
        `
      }).single()
      
      if (!error && data) {
        console.log(`📦 Messages in queue: ${data.message_count}`)
      }
    } else {
      console.log('❌ Queue "github_code_parsing" does not exist')
      
      // Check if we need to create it
      console.log('\n💡 To create the queue, you can run:')
      console.log('  await supabase.rpc("pgmq_create", { p_queue_name: "github_code_parsing" })')
    }

  } catch (error) {
    console.error('Error:', error)
  }
}

// Run the check
checkQueues()