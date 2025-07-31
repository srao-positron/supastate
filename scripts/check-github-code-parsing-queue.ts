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

async function checkGithubCodeParsingQueue() {
  console.log('🔍 Checking github_code_parsing PGMQ queue status...\n')

  try {
    // Check queue metrics
    const { data: metrics, error: metricsError } = await supabase.rpc('pgmq_metrics', {
      p_queue_name: 'github_code_parsing'
    })

    if (metricsError) {
      console.error('Error fetching queue metrics:', metricsError)
      return
    }

    if (!metrics || metrics.length === 0) {
      console.log('❌ Queue "github_code_parsing" not found or has no metrics')
      
      // List all available queues
      const { data: allQueues, error: listError } = await supabase.rpc('pgmq_list_queues')
      
      if (!listError && allQueues) {
        console.log('\n📋 Available queues:')
        allQueues.forEach((q: any) => {
          console.log(`  - ${q.queue_name}`)
        })
      }
      return
    }

    const queueMetrics = metrics[0]
    console.log('📊 Queue Metrics:')
    console.log(`  Queue Name: ${queueMetrics.queue_name}`)
    console.log(`  Queue Length: ${queueMetrics.queue_length || 0}`)
    console.log(`  Total Messages: ${queueMetrics.total_messages || 0}`)
    console.log(`  Newest Message Age: ${queueMetrics.newest_msg_age_sec ? `${queueMetrics.newest_msg_age_sec}s` : 'N/A'}`)
    console.log(`  Oldest Message Age: ${queueMetrics.oldest_msg_age_sec ? `${queueMetrics.oldest_msg_age_sec}s` : 'N/A'}`)

    // Try to peek at messages without consuming them
    console.log('\n🔍 Attempting to peek at messages...')
    
    // Check the pgmq schema tables directly
    const { data: messages, error: peekError } = await supabase
      .from('pgmq.github_code_parsing')
      .select('*')
      .order('enqueued_at', { ascending: false })
      .limit(5)

    if (peekError) {
      console.log('Could not peek at messages directly:', peekError.message)
      
      // Try using the peek function
      const { data: peeked, error: peekFnError } = await supabase.rpc('pgmq_peek', {
        p_queue_name: 'github_code_parsing',
        p_qty: 5
      })

      if (!peekFnError && peeked) {
        console.log(`\n📦 Found ${peeked.length} messages in queue:`)
        peeked.forEach((msg: any, index: number) => {
          console.log(`\n  Message ${index + 1}:`)
          console.log(`    ID: ${msg.msg_id}`)
          console.log(`    VT: ${msg.vt}`)
          console.log(`    Enqueued At: ${msg.enqueued_at}`)
          console.log(`    Read Count: ${msg.read_ct}`)
          if (msg.message) {
            console.log(`    Message: ${JSON.stringify(msg.message, null, 2)}`)
          }
        })
      } else {
        console.log('Could not peek at messages using function:', peekFnError?.message)
      }
    } else if (messages) {
      console.log(`\n📦 Found ${messages.length} messages in queue:`)
      messages.forEach((msg: any, index: number) => {
        console.log(`\n  Message ${index + 1}:`)
        console.log(`    ID: ${msg.msg_id}`)
        console.log(`    VT: ${msg.vt}`)
        console.log(`    Enqueued At: ${msg.enqueued_at}`)
        console.log(`    Read Count: ${msg.read_ct}`)
        if (msg.message) {
          console.log(`    Message: ${JSON.stringify(msg.message, null, 2)}`)
        }
      })
    }

    // Check if there are any archived messages
    const { data: archived, error: archiveError } = await supabase
      .from('pgmq.a_github_code_parsing')
      .select('count')
      .single()

    if (!archiveError && archived) {
      console.log(`\n📚 Archived messages: ${archived.count || 0}`)
    }

  } catch (error) {
    console.error('Error checking queue:', error)
  }
}

// Run the check
checkGithubCodeParsingQueue()