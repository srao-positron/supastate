#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zqlfxakbkwssxfynrmnk.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxbGZ4YWtia3dzc3hmeW5ybW5rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzEyNDMxMiwiZXhwIjoyMDY4NzAwMzEyfQ.Dvvga6Y4vu7xtorjzgQ3B4kjoJYvISQcnOEAIuoFSOU'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  console.log('=== Direct PGMQ Table Inspection ===\n')
  
  // 1. Check pgmq schema tables
  console.log('1. Checking PGMQ tables:')
  const { data: tables, error: tablesError } = await supabase
    .from('information_schema.tables')
    .select('table_schema, table_name')
    .eq('table_schema', 'pgmq')
    .ilike('table_name', '%code_ingestion%')
  
  if (tablesError) {
    console.error('Error checking tables:', tablesError)
  } else if (tables && tables.length > 0) {
    console.log('Found PGMQ tables:')
    for (const table of tables) {
      console.log(`  - ${table.table_schema}.${table.table_name}`)
    }
  }
  
  // 2. Check the actual queue table
  console.log('\n2. Checking pgmq.q_code_ingestion table directly:')
  const { data: queueData, error: queueError } = await supabase
    .from('pgmq.q_code_ingestion')
    .select('msg_id, read_ct, enqueued_at, vt, message')
    .order('msg_id', { ascending: false })
    .limit(10)
  
  if (queueError) {
    console.error('Error querying queue table:', queueError)
  } else if (queueData && queueData.length > 0) {
    console.log(`Found ${queueData.length} messages in queue table`)
    for (const msg of queueData.slice(0, 5)) {
      console.log(`\nMessage ${msg.msg_id}:`)
      console.log(`  - Read count: ${msg.read_ct}`)
      console.log(`  - Enqueued: ${new Date(msg.enqueued_at).toLocaleString()}`)
      console.log(`  - Visibility timeout: ${msg.vt ? new Date(msg.vt).toLocaleString() : 'null'}`)
      console.log(`  - Entity ID: ${msg.message?.code_entity_id}`)
      console.log(`  - User ID: ${msg.message?.user_id}`)
    }
  } else {
    console.log('No messages found in queue table')
  }
  
  // 3. Check archive table
  console.log('\n3. Checking pgmq.q_code_ingestion_archive table:')
  const { data: archiveData, error: archiveError } = await supabase
    .from('pgmq.q_code_ingestion_archive')
    .select('msg_id, read_ct, archived_at, message')
    .order('archived_at', { ascending: false })
    .limit(10)
  
  if (archiveError) {
    console.error('Error querying archive table:', archiveError)
  } else if (archiveData && archiveData.length > 0) {
    console.log(`Found ${archiveData.length} messages in archive`)
    for (const msg of archiveData.slice(0, 5)) {
      console.log(`\nArchived message ${msg.msg_id}:`)
      console.log(`  - Read count: ${msg.read_ct}`)
      console.log(`  - Archived: ${new Date(msg.archived_at).toLocaleString()}`)
      console.log(`  - Entity ID: ${msg.message?.code_entity_id}`)
    }
  } else {
    console.log('No messages in archive')
  }
  
  // 4. Count total messages
  console.log('\n4. Message counts:')
  
  // Count in queue
  const { count: queueCount, error: countError1 } = await supabase
    .from('pgmq.q_code_ingestion')
    .select('*', { count: 'exact', head: true })
  
  // Count in archive
  const { count: archiveCount, error: countError2 } = await supabase
    .from('pgmq.q_code_ingestion_archive')
    .select('*', { count: 'exact', head: true })
  
  console.log(`  - Active messages: ${queueCount || 0}`)
  console.log(`  - Archived messages: ${archiveCount || 0}`)
  
  // 5. Check if messages are locked (have future vt)
  console.log('\n5. Checking for locked messages:')
  const { data: lockedMessages, error: lockedError } = await supabase
    .from('pgmq.q_code_ingestion')
    .select('msg_id, vt')
    .gt('vt', new Date().toISOString())
    .limit(10)
  
  if (lockedError) {
    console.error('Error checking locked messages:', lockedError)
  } else if (lockedMessages && lockedMessages.length > 0) {
    console.log(`Found ${lockedMessages.length} locked messages`)
    for (const msg of lockedMessages) {
      const lockTime = new Date(msg.vt)
      const now = new Date()
      const remainingMs = lockTime.getTime() - now.getTime()
      console.log(`  - Message ${msg.msg_id}: locked for ${Math.round(remainingMs / 1000)} more seconds`)
    }
  } else {
    console.log('No locked messages found')
  }
  
  // 6. Recommendation based on findings
  console.log('\n\n=== ANALYSIS ===')
  if (queueCount && queueCount > 0) {
    console.log(`\nFound ${queueCount} messages in the code_ingestion queue.`)
    console.log('These appear to be referencing code entities that no longer exist.')
    console.log('\nTo fix this issue:')
    console.log('1. Stop the code-ingestion workers')
    console.log('2. Clear all messages from the queue')
    console.log('3. Ensure code entities exist before queueing ingestion')
    
    console.log('\n\nTo clear the queue, run:')
    console.log('DELETE FROM pgmq.q_code_ingestion;')
  } else {
    console.log('\nThe queue appears to be empty.')
    console.log('If workers are still processing messages, they may be locked with visibility timeouts.')
  }
}

main().catch(console.error)