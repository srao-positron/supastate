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

async function listAllQueues() {
  console.log('📋 Listing all PGMQ queues...\n')
  
  try {
    // List all queues
    const { data: queues, error: listError } = await supabase.rpc('pgmq_list_queues')
    
    if (listError) {
      console.error('Error listing queues:', listError)
      return
    }
    
    if (!queues || queues.length === 0) {
      console.log('No queues found')
      return
    }
    
    console.log(`Found ${queues.length} queue(s):\n`)
    
    // Check metrics for each queue
    for (const queue of queues) {
      const queueName = queue.queue_name
      console.log(`\n📊 Queue: ${queueName}`)
      console.log(`${'='.repeat(50)}`)
      
      try {
        const { data: metrics, error: metricsError } = await supabase.rpc('pgmq_metrics', {
          p_queue_name: queueName
        })
        
        if (!metricsError && metrics && metrics.length > 0) {
          const m = metrics[0]
          console.log(`  Queue Length: ${m.queue_length || 0}`)
          console.log(`  Total Messages: ${m.total_messages || 0}`)
          console.log(`  Newest Message Age: ${m.newest_msg_age_sec ? `${m.newest_msg_age_sec}s` : 'N/A'}`)
          console.log(`  Oldest Message Age: ${m.oldest_msg_age_sec ? `${m.oldest_msg_age_sec}s` : 'N/A'}`)
          console.log(`  Created At: ${m.created_at || 'N/A'}`)
          console.log(`  Is Unlogged: ${m.is_unlogged || false}`)
        } else {
          console.log('  No metrics available')
        }
      } catch (e) {
        console.log('  Error fetching metrics:', e.message)
      }
    }
    
    // Also check for any github-related queues specifically
    console.log('\n\n🔍 Searching for GitHub-related queues...')
    const githubQueues = queues.filter(q => 
      q.queue_name.toLowerCase().includes('github') || 
      q.queue_name.toLowerCase().includes('code')
    )
    
    if (githubQueues.length > 0) {
      console.log(`Found ${githubQueues.length} GitHub-related queue(s):`)
      githubQueues.forEach(q => console.log(`  - ${q.queue_name}`))
    } else {
      console.log('No GitHub-related queues found')
    }
    
  } catch (error) {
    console.error('Error:', error)
  }
}

// Run the listing
listAllQueues()