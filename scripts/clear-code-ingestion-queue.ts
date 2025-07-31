#!/usr/bin/env npx tsx
/**
 * Clear all messages from the PGMQ code_ingestion queue
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:')
  console.error('  - NEXT_PUBLIC_SUPABASE_URL')
  console.error('  - SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function clearCodeIngestionQueue() {
  console.log('🔍 Checking code_ingestion queue...')
  
  try {
    // 1. Check current queue length using raw SQL
    const { data: currentQueueData, error: countError } = await supabase
      .rpc('sql' as any, {
        query: 'SELECT COUNT(*) as count FROM pgmq.q_code_ingestion'
      })
    
    if (!countError && currentQueueData) {
      console.log(`📊 Current queue length: ${currentQueueData[0]?.count || 0} messages`)
    } else {
      // Try using pgmq.metrics if available
      const { data: metrics } = await supabase
        .rpc('sql' as any, {
          query: "SELECT * FROM pgmq.metrics('code_ingestion')"
        })
      
      if (metrics && metrics[0]) {
        console.log(`📊 Current queue metrics:`, metrics[0])
      }
    }
    
    // 2. Purge the queue
    console.log('\n🧹 Purging code_ingestion queue...')
    
    // First try the wrapper function if it exists
    const { data: purgeResult, error: purgeError } = await supabase
      .rpc('pgmq_purge_queue', { queue_name: 'code_ingestion' })
    
    if (purgeError) {
      console.log('⚠️  Wrapper function not available, using direct SQL...')
      
      // Fallback to direct SQL execution
      const { data: directPurge, error: directError } = await supabase
        .rpc('sql' as any, {
          query: "SELECT pgmq.purge_queue('code_ingestion') as messages_deleted"
        })
      
      if (directError) {
        console.error('❌ Error purging queue:', directError)
        throw directError
      }
      
      const deletedCount = directPurge?.[0]?.messages_deleted || 0
      console.log(`✅ Queue purged successfully! Deleted ${deletedCount} messages`)
    } else {
      console.log(`✅ Queue purged successfully! Deleted ${purgeResult} messages`)
    }
    
    // 3. Verify queue is empty
    console.log('\n🔍 Verifying queue is empty...')
    const { data: finalQueueData } = await supabase
      .rpc('sql' as any, {
        query: 'SELECT COUNT(*) as count FROM pgmq.q_code_ingestion'
      })
    
    const finalCount = finalQueueData?.[0]?.count || 0
    if (finalCount === 0) {
      console.log('✅ Queue is now empty!')
    } else {
      console.log(`⚠️  Queue still has ${finalCount} messages`)
    }
    
    console.log('\n✅ Code ingestion queue clearing completed!')
    
  } catch (error) {
    console.error('❌ Failed to clear queue:', error)
    process.exit(1)
  }
}

// Run the script
clearCodeIngestionQueue()