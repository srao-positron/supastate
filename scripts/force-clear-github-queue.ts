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

async function forceClearQueue() {
  console.log('🔍 Force clearing github_code_parsing queue...\n')
  
  try {
    // Try to purge the entire queue
    console.log('🗑️  Attempting to purge the queue...')
    const { error: purgeError } = await supabase.rpc('pgmq_purge_queue', {
      queue_name: 'github_code_parsing'
    })
    
    if (purgeError) {
      console.error('Purge error:', purgeError)
      
      // Try alternative method - archive messages
      console.log('\n📦 Trying to archive old messages...')
      const { error: archiveError } = await supabase.rpc('pgmq_archive', {
        queue_name: 'github_code_parsing',
        vt: 0  // Archive immediately
      })
      
      if (archiveError) {
        console.error('Archive error:', archiveError)
      } else {
        console.log('✅ Archived old messages')
      }
    } else {
      console.log('✅ Queue purged successfully')
    }
    
    // Check final metrics
    const { data: metrics, error: metricsError } = await supabase.rpc('pgmq_metrics', {
      p_queue_name: 'github_code_parsing'
    })
    
    if (!metricsError && metrics && metrics.length > 0) {
      console.log('\nFinal Queue Metrics:', metrics[0])
    }
    
  } catch (error) {
    console.error('Error:', error)
  }
}

forceClearQueue()