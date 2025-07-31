import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function purgeGithubCodeParsingQueue() {
  console.log('🧹 Purging github_code_parsing queue...\n')

  try {
    // First check queue metrics
    console.log('📊 Checking queue status before purge...')
    const { data: metricsBefore, error: metricsError } = await supabase
      .rpc('pgmq_metrics', { p_queue_name: 'github_code_parsing' })

    if (!metricsError && metricsBefore && metricsBefore.length > 0) {
      const metrics = metricsBefore[0]
      console.log(`Queue length: ${metrics.queue_length}`)
      console.log(`Oldest message age: ${metrics.oldest_msg_age_sec}s`)
      console.log(`Newest message age: ${metrics.newest_msg_age_sec}s\n`)
    }

    // Method 1: Read and delete all messages
    console.log('🔄 Reading and deleting messages in batches...')
    let totalDeleted = 0
    let hasMore = true
    
    while (hasMore) {
      // Read up to 100 messages
      const { data: messages, error: readError } = await supabase
        .rpc('pgmq_read', {
          queue_name: 'github_code_parsing',
          vt: 1, // visibility timeout of 1 second
          qty: 100
        })

      if (readError) {
        console.error('❌ Error reading messages:', readError)
        hasMore = false
        break
      }

      if (!messages || messages.length === 0) {
        hasMore = false
        break
      }

      // Delete each message
      console.log(`  Found ${messages.length} messages, deleting...`)
      for (const msg of messages) {
        const { error: deleteError } = await supabase
          .rpc('pgmq_delete', {
            queue_name: 'github_code_parsing',
            msg_id: msg.msg_id
          })

        if (!deleteError) {
          totalDeleted++
        }
      }
    }

    console.log(`\n✅ Deleted ${totalDeleted} messages from the queue`)

    // Method 2: Try using pgmq.purge_queue directly via raw SQL
    console.log('\n🗑️  Attempting pgmq.purge_queue() via SQL...')
    
    // Create a wrapper function to call pgmq.purge_queue
    const createPurgeWrapper = `
      CREATE OR REPLACE FUNCTION public.pgmq_purge_queue(queue_name text)
      RETURNS bigint
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$
      DECLARE
        deleted_count bigint;
      BEGIN
        SELECT pgmq.purge_queue(queue_name) INTO deleted_count;
        RETURN deleted_count;
      END;
      $$;
    `

    // Try to create the wrapper
    await supabase.rpc('exec_sql', { sql: createPurgeWrapper }).catch(() => {
      console.log('Could not create purge wrapper function')
    })

    // Try to use the wrapper
    const { data: purgeResult, error: purgeError } = await supabase
      .rpc('pgmq_purge_queue', { queue_name: 'github_code_parsing' })

    if (!purgeError && purgeResult !== null) {
      console.log(`✅ Purged ${purgeResult} additional messages using pgmq.purge_queue()`)
    } else if (purgeError) {
      console.log('❌ Could not use pgmq.purge_queue():', purgeError.message)
    }

    // Check final metrics
    console.log('\n📊 Checking queue status after purge...')
    const { data: metricsAfter, error: metricsError2 } = await supabase
      .rpc('pgmq_metrics', { p_queue_name: 'github_code_parsing' })

    if (!metricsError2 && metricsAfter && metricsAfter.length > 0) {
      const metrics = metricsAfter[0]
      console.log(`Queue length: ${metrics.queue_length}`)
      
      if (metrics.queue_length === 0) {
        console.log('\n✅ Queue successfully purged!')
      } else {
        console.log(`\n⚠️  ${metrics.queue_length} messages still remain in queue`)
      }
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error)
    process.exit(1)
  }
}

// Run the purge
purgeGithubCodeParsingQueue()
  .then(() => {
    console.log('\n✨ Done!')
    process.exit(0)
  })
  .catch(error => {
    console.error('\n❌ Script failed:', error)
    process.exit(1)
  })