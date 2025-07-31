#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zqlfxakbkwssxfynrmnk.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxbGZ4YWtia3dzc3hmeW5ybW5rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzEyNDMxMiwiZXhwIjoyMDY4NzAwMzEyfQ.Dvvga6Y4vu7xtorjzgQ3B4kjoJYvISQcnOEAIuoFSOU'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  console.log('=== Clearing Stale Code Ingestion Messages ===\n')
  
  let totalDeleted = 0
  let totalValid = 0
  let totalProcessed = 0
  const batchSize = 100
  
  console.log('Processing messages in batches...')
  
  while (true) {
    // Read messages without locking them
    const { data: messages, error: readError } = await supabase.rpc('pgmq_read', {
      queue_name: 'code_ingestion',
      vt: 0,
      qty: batchSize
    })
    
    if (readError) {
      console.error('Error reading messages:', readError)
      break
    }
    
    if (!messages || messages.length === 0) {
      console.log('\nNo more messages in queue')
      break
    }
    
    console.log(`\nProcessing batch of ${messages.length} messages...`)
    
    for (const msg of messages) {
      totalProcessed++
      const codeEntityId = msg.message?.code_entity_id
      
      if (!codeEntityId) {
        // Invalid message format, delete it
        await supabase.rpc('pgmq_delete', {
          queue_name: 'code_ingestion',
          msg_id: msg.msg_id
        })
        totalDeleted++
        continue
      }
      
      // Check if entity exists
      const { data: entity, error: entityError } = await supabase
        .from('code_entities')
        .select('id')
        .eq('id', codeEntityId)
        .single()
      
      if (entityError || !entity) {
        // Entity doesn't exist, delete the message
        const { error: deleteError } = await supabase.rpc('pgmq_delete', {
          queue_name: 'code_ingestion',
          msg_id: msg.msg_id
        })
        
        if (deleteError) {
          console.error(`Failed to delete message ${msg.msg_id}:`, deleteError)
        } else {
          totalDeleted++
          if (totalDeleted % 10 === 0) {
            console.log(`  Deleted ${totalDeleted} stale messages so far...`)
          }
        }
      } else {
        totalValid++
      }
    }
    
    // Progress update
    console.log(`Progress: ${totalProcessed} processed, ${totalDeleted} deleted, ${totalValid} valid`)
    
    // Safety limit to prevent infinite loop
    if (totalProcessed >= 10000) {
      console.log('\nReached safety limit of 10,000 messages')
      break
    }
  }
  
  console.log('\n=== Summary ===')
  console.log(`Total messages processed: ${totalProcessed}`)
  console.log(`Stale messages deleted: ${totalDeleted}`)
  console.log(`Valid messages remaining: ${totalValid}`)
  
  // Check final queue status
  const { data: finalMessages } = await supabase.rpc('pgmq_read', {
    queue_name: 'code_ingestion',
    vt: 0,
    qty: 1
  })
  
  if (finalMessages && finalMessages.length > 0) {
    console.log(`\n⚠️  Queue still has messages. You may need to run this again.`)
  } else {
    console.log(`\n✅ Queue is now empty!`)
  }
}

main().catch(console.error)