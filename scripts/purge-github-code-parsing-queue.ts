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
    // First, check the current queue status
    console.log('📊 Checking current queue status...')
    const { data: beforeStats, error: statsError } = await supabase.rpc('pgmq_queue_metrics', {
      queue_name: 'github_code_parsing'
    })

    if (statsError) {
      console.error('❌ Error checking queue status:', statsError)
    } else if (beforeStats) {
      console.log('Before purge:')
      console.log(`  Total messages: ${beforeStats.total_messages || 0}`)
      console.log(`  Queue length: ${beforeStats.queue_length || 0}`)
      console.log(`  Oldest message age: ${beforeStats.oldest_msg_age || 'N/A'}\n`)
    }

    // Purge the queue
    console.log('🗑️  Purging all messages from github_code_parsing queue...')
    const { data: purgeResult, error: purgeError } = await supabase.rpc('pgmq_purge_queue', {
      queue_name: 'github_code_parsing'
    })

    if (purgeError) {
      console.error('❌ Error purging queue:', purgeError)
      throw purgeError
    }

    console.log('✅ Queue purged successfully!')
    console.log(`   Messages purged: ${purgeResult || 'All'}\n`)

    // Check the queue status after purge
    console.log('📊 Checking queue status after purge...')
    const { data: afterStats, error: afterStatsError } = await supabase.rpc('pgmq_queue_metrics', {
      queue_name: 'github_code_parsing'
    })

    if (afterStatsError) {
      console.error('❌ Error checking queue status after purge:', afterStatsError)
    } else if (afterStats) {
      console.log('After purge:')
      console.log(`  Total messages: ${afterStats.total_messages || 0}`)
      console.log(`  Queue length: ${afterStats.queue_length || 0}`)
      console.log(`  Oldest message age: ${afterStats.oldest_msg_age || 'N/A'}\n`)
    }

    // Also check if there are any messages in the queue table directly
    console.log('🔍 Verifying queue is empty...')
    const { data: remainingMessages, error: checkError } = await supabase
      .from('pgmq_github_code_parsing')
      .select('msg_id, enqueued_at, vt')
      .limit(5)

    if (checkError) {
      console.error('❌ Error checking remaining messages:', checkError)
    } else {
      if (remainingMessages && remainingMessages.length > 0) {
        console.log(`⚠️  Warning: Found ${remainingMessages.length} messages still in queue:`)
        remainingMessages.forEach(msg => {
          console.log(`   - Message ${msg.msg_id}: enqueued at ${msg.enqueued_at}, visible at ${msg.vt}`)
        })
      } else {
        console.log('✅ Queue is completely empty!')
      }
    }

    console.log('\n✨ Purge operation completed!')

  } catch (error) {
    console.error('❌ Failed to purge queue:', error)
    process.exit(1)
  }
}

// Run the purge
purgeGithubCodeParsingQueue()
  .then(() => {
    console.log('\n👍 Done!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error)
    process.exit(1)
  })