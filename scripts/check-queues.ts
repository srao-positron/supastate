#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zqlfxakbkwssxfynrmnk.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxbGZ4YWtia3dzc3hmeW5ybW5rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzEyNDMxMiwiZXhwIjoyMDY4NzAwMzEyfQ.Dvvga6Y4vu7xtorjzgQ3B4kjoJYvISQcnOEAIuoFSOU'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  console.log('=== Queue Status Check ===\n')
  
  // 1. Get all queue metrics
  console.log('1. All Queue Metrics:')
  const { data: metrics, error: metricsError } = await supabase.rpc('pgmq_metrics_all')
  
  if (metricsError) {
    console.error('Error getting metrics:', metricsError)
  } else if (metrics) {
    for (const queue of metrics) {
      console.log(`\n${queue.queue_name}:`)
      console.log(`  - Total messages: ${queue.total_messages}`)
      console.log(`  - Queue length: ${queue.queue_length}`)
      console.log(`  - Oldest message age: ${queue.oldest_msg_age_sec ? (queue.oldest_msg_age_sec / 60).toFixed(1) + ' minutes' : 'N/A'}`)
      console.log(`  - Newest message age: ${queue.newest_msg_age_sec ? (queue.newest_msg_age_sec / 60).toFixed(1) + ' minutes' : 'N/A'}`)
    }
  }
  
  // 2. Read some messages from code_ingestion queue
  console.log('\n\n2. Reading messages from code_ingestion queue:')
  const { data: messages, error: readError } = await supabase.rpc('pgmq_read', {
    queue_name: 'code_ingestion',
    vt: 0, // Don't lock messages
    qty: 10
  })
  
  if (readError) {
    console.error('Error reading messages:', readError)
  } else if (messages && messages.length > 0) {
    console.log(`Found ${messages.length} messages`)
    for (const msg of messages.slice(0, 5)) {
      console.log(`\nMessage ${msg.msg_id}:`)
      console.log(`  - Read count: ${msg.read_ct}`)
      console.log(`  - Entity ID: ${msg.message?.code_entity_id}`)
      console.log(`  - User ID: ${msg.message?.user_id}`)
      console.log(`  - Workspace ID: ${msg.message?.workspace_id}`)
      
      // Check if entity exists
      if (msg.message?.code_entity_id) {
        const { data: entity, error: entityError } = await supabase
          .from('code_entities')
          .select('id, name')
          .eq('id', msg.message.code_entity_id)
          .single()
        
        if (entityError || !entity) {
          console.log(`  - ❌ Entity NOT FOUND in database`)
        } else {
          console.log(`  - ✓ Entity exists: ${entity.name}`)
        }
      }
    }
  } else {
    console.log('No messages found in queue')
  }
  
  // 3. Check archived messages
  console.log('\n\n3. Checking archived messages:')
  const { data: archived, error: archiveError } = await supabase.rpc('pgmq_read_archive', {
    queue_name: 'code_ingestion',
    batch_size: 10
  })
  
  if (archiveError) {
    console.error('Error reading archive:', archiveError)
  } else if (archived && archived.length > 0) {
    console.log(`Found ${archived.length} archived messages`)
    for (const msg of archived.slice(0, 3)) {
      console.log(`\nArchived message ${msg.msg_id}:`)
      console.log(`  - Read count: ${msg.read_ct}`)
      console.log(`  - Archived at: ${new Date(msg.archived_at).toLocaleString()}`)
      console.log(`  - Entity ID: ${msg.message?.code_entity_id}`)
    }
  } else {
    console.log('No archived messages')
  }
  
  // 4. Purge stale messages
  console.log('\n\n4. Purging stale messages:')
  console.log('Would you like to purge all messages referencing non-existent entities?')
  console.log('Run: npx tsx scripts/clear-stale-code-messages.ts')
}

main().catch(console.error)