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

async function purgeQueue() {
  console.log('🧹 Purging github_code_parsing queue...\n')

  try {
    // First, check how many messages are in the queue
    console.log('📊 Checking current queue status...')
    const { count: beforeCount, error: countError1 } = await supabase
      .from('pgmq_github_code_parsing')
      .select('*', { count: 'exact', head: true })

    if (!countError1) {
      console.log(`Messages in queue before purge: ${beforeCount}\n`)
    }

    // Method 1: Try using the pgmq_delete function to delete all messages
    console.log('1. Trying pgmq_delete to remove all messages...')
    try {
      // Get all message IDs first
      const { data: messages, error: fetchError } = await supabase
        .from('pgmq_github_code_parsing')
        .select('msg_id')
        .limit(1000) // Get up to 1000 messages

      if (!fetchError && messages && messages.length > 0) {
        console.log(`Found ${messages.length} messages to delete`)
        
        // Delete each message using pgmq_delete
        for (const msg of messages) {
          await supabase.rpc('pgmq_delete', {
            queue_name: 'github_code_parsing',
            msg_id: msg.msg_id
          })
        }
        console.log('✅ Deleted messages using pgmq_delete')
      }
    } catch (e) {
      console.log('❌ pgmq_delete method failed:', e)
    }

    // Method 2: Direct table deletion
    console.log('\n2. Trying direct deletion from queue table...')
    const { error: deleteError } = await supabase
      .from('pgmq_github_code_parsing')
      .delete()
      .gte('msg_id', 0) // Delete all messages (msg_id is always >= 0)

    if (!deleteError) {
      console.log('✅ Successfully deleted all messages from queue table')
    } else {
      console.log('❌ Direct deletion failed:', deleteError)
      
      // Method 3: Try TRUNCATE via raw SQL (if we have permission)
      console.log('\n3. Attempting TRUNCATE via raw SQL...')
      const { error: truncateError } = await supabase.rpc('exec_sql', {
        sql: 'TRUNCATE TABLE pgmq.github_code_parsing RESTART IDENTITY;'
      }).catch(() => ({ error: 'exec_sql not available or permission denied' }))
      
      if (!truncateError) {
        console.log('✅ Successfully truncated queue table')
      } else {
        console.log('❌ TRUNCATE failed:', truncateError)
      }
    }

    // Check final status
    console.log('\n📊 Checking final queue status...')
    const { count: afterCount, error: countError2 } = await supabase
      .from('pgmq_github_code_parsing')
      .select('*', { count: 'exact', head: true })

    if (!countError2) {
      console.log(`Messages in queue after purge: ${afterCount}`)
      
      if (afterCount === 0) {
        console.log('\n✅ Queue successfully purged!')
      } else {
        console.log(`\n⚠️  ${afterCount} messages still remain in queue`)
        
        // Show sample of remaining messages
        const { data: remaining, error: sampleError } = await supabase
          .from('pgmq_github_code_parsing')
          .select('msg_id, enqueued_at, vt, message')
          .limit(5)
          
        if (!sampleError && remaining) {
          console.log('\nSample of remaining messages:')
          remaining.forEach(msg => {
            console.log(`- ID: ${msg.msg_id}, Enqueued: ${msg.enqueued_at}, Visible: ${msg.vt}`)
          })
        }
      }
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error)
  }
}

purgeQueue().then(() => {
  console.log('\n✨ Done!')
  process.exit(0)
}).catch(error => {
  console.error('\n❌ Script failed:', error)
  process.exit(1)
})