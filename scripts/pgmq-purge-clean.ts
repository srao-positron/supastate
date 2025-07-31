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
    // Check queue metrics before
    console.log('📊 Checking queue status before purge...')
    const { data: metricsBefore, error: metricsError } = await supabase
      .rpc('pgmq_metrics', { p_queue_name: 'github_code_parsing' })

    if (!metricsError && metricsBefore && metricsBefore.length > 0) {
      const metrics = metricsBefore[0]
      console.log(`Queue length: ${metrics.queue_length}`)
      if (metrics.queue_length > 0) {
        console.log(`Oldest message age: ${metrics.oldest_msg_age_sec}s`)
        console.log(`Newest message age: ${metrics.newest_msg_age_sec}s`)
      }
      console.log('')
    }

    // Read and delete all messages
    console.log('🔄 Purging messages...')
    let totalDeleted = 0
    let hasMore = true
    let iterations = 0
    
    while (hasMore && iterations < 100) { // Safety limit
      iterations++
      
      // Read up to 100 messages at a time
      const { data: messages, error: readError } = await supabase
        .rpc('pgmq_read', {
          queue_name: 'github_code_parsing',
          vt: 1, // 1 second visibility timeout
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
      console.log(`  Deleting batch of ${messages.length} messages...`)
      for (const msg of messages) {
        const { error: deleteError } = await supabase
          .rpc('pgmq_delete', {
            queue_name: 'github_code_parsing',
            msg_id: msg.msg_id
          })

        if (!deleteError) {
          totalDeleted++
        } else {
          console.error(`  Failed to delete message ${msg.msg_id}:`, deleteError)
        }
      }
    }

    if (totalDeleted > 0) {
      console.log(`\n✅ Successfully deleted ${totalDeleted} messages`)
    } else {
      console.log('\n✅ No messages to delete')
    }

    // Check final metrics
    console.log('\n📊 Checking queue status after purge...')
    const { data: metricsAfter, error: metricsError2 } = await supabase
      .rpc('pgmq_metrics', { p_queue_name: 'github_code_parsing' })

    if (!metricsError2 && metricsAfter && metricsAfter.length > 0) {
      const metrics = metricsAfter[0]
      console.log(`Queue length: ${metrics.queue_length}`)
      
      if (metrics.queue_length === 0) {
        console.log('\n✅ Queue successfully purged! All messages have been removed.')
      } else {
        console.log(`\n⚠️  ${metrics.queue_length} messages still remain in queue`)
        console.log('   You may need to run this script again or check for stuck messages')
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
    console.log('\n✨ Purge operation completed!')
    process.exit(0)
  })
  .catch(error => {
    console.error('\n❌ Script failed:', error)
    process.exit(1)
  })