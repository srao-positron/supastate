import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

async function checkCodeIngestionQueue() {
  console.log('🔍 Checking code_ingestion queue status...\n')

  try {
    // 1. Check queue metrics using pgmq wrapper function
    const { data: metrics, error: metricsError } = await supabase
      .rpc('get_pgmq_metrics', { queue_name: 'code_ingestion' })

    if (metricsError) {
      console.error('Error checking queue metrics:', metricsError)
    } else if (metrics && metrics[0]) {
      const m = metrics[0]
      console.log(`📊 Queue Metrics:`)
      console.log(`- Queue length: ${m.queue_length}`)
      console.log(`- Newest message age: ${m.newest_msg_age_sec ? (m.newest_msg_age_sec / 60).toFixed(1) : 'N/A'} minutes`)
      console.log(`- Oldest message age: ${m.oldest_msg_age_sec ? (m.oldest_msg_age_sec / 3600).toFixed(1) : 'N/A'} hours`)
      console.log(`- Total messages: ${m.total_messages}\n`)
    }

    // 2. Read sample messages using pgmq_read
    console.log('📋 Reading sample messages from queue:')
    const { data: messages, error: readError } = await supabase
      .rpc('pgmq_read', { 
        queue_name: 'code_ingestion',
        vt: 0,  // Don't change visibility
        qty: 20  // Read 20 messages
      })

    if (readError) {
      console.error('Error reading messages:', readError)
      return
    }

    if (!messages || messages.length === 0) {
      console.log('No messages found in queue')
      return
    }

    console.log(`\nFound ${messages.length} messages:`)
    const entityIds: string[] = []
    
    messages.forEach((msg: any) => {
      const entityId = msg.message?.code_entity_id
      const enqueuedAt = new Date(msg.enqueued_at).toLocaleString()
      console.log(`- msg_id: ${msg.msg_id}, entity_id: ${entityId}, enqueued: ${enqueuedAt}`)
      if (entityId) entityIds.push(entityId)
    })

    // 3. Check if entity IDs exist in code_entities table
    if (entityIds.length === 0) {
      console.log('\nNo entity IDs found in messages')
      return
    }

    console.log('\n🔍 Checking entity validity...')
    const uniqueEntityIds = [...new Set(entityIds)]
    console.log(`Checking ${uniqueEntityIds.length} unique entity IDs...`)

    // Check which entities exist
    const validityResults = await Promise.all(
      uniqueEntityIds.map(async (entityId) => {
        const { data, error } = await supabase
          .from('code_entities')
          .select('id')
          .eq('id', entityId)
          .single()

        return {
          entityId,
          exists: !error && data !== null,
          error: error?.message
        }
      })
    )

    // Display results
    console.log('\nEntity validity results:')
    const validCount = validityResults.filter(r => r.exists).length
    const invalidCount = validityResults.filter(r => !r.exists).length

    validityResults.forEach(result => {
      const status = result.exists ? '✅ EXISTS' : '❌ NOT FOUND'
      console.log(`- ${result.entityId}: ${status}`)
    })

    console.log(`\n📊 Summary:`)
    console.log(`- Valid entities: ${validCount} (${(validCount/validityResults.length*100).toFixed(1)}%)`)
    console.log(`- Invalid entities: ${invalidCount} (${(invalidCount/validityResults.length*100).toFixed(1)}%)`)

    // Provide recommendations
    console.log('\n💡 Recommendations:')
    if (invalidCount > validCount * 0.5) {
      console.log('- ⚠️  More than 50% of entities are invalid!')
      console.log('- 🧹 Consider purging the queue to avoid wasting processing time')
      console.log('- Run: npx tsx scripts/clear-code-queue.ts')
    } else if (invalidCount > 0) {
      console.log('- Some invalid entities found, but majority are valid')
      console.log('- Consider selective cleanup of invalid messages')
    } else {
      console.log('- ✅ All sampled entities are valid')
    }

    // Check for stuck messages (older than 24 hours)
    const oldMessages = messages.filter((msg: any) => {
      const age = Date.now() - new Date(msg.enqueued_at).getTime()
      return age > 24 * 60 * 60 * 1000 // 24 hours
    })

    if (oldMessages.length > 0) {
      console.log(`\n⚠️  Warning: ${oldMessages.length} messages are older than 24 hours`)
      console.log('These messages may be stuck and should be investigated or purged')
    }

  } catch (error) {
    console.error('Error checking queue:', error)
  }
}

// Run the check
checkCodeIngestionQueue()