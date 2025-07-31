#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zqlfxakbkwssxfynrmnk.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxbGZ4YWtia3dzc3hmeW5ybW5rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzEyNDMxMiwiZXhwIjoyMDY4NzAwMzEyfQ.Dvvga6Y4vu7xtorjzgQ3B4kjoJYvISQcnOEAIuoFSOU'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  console.log('=== Debugging Code Ingestion Flow ===\n')
  
  // 1. Check if code entities exist in Supabase
  const { data: recentEntities, count } = await supabase
    .from('code_entities')
    .select('id, name, path, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(5)
  
  console.log(`Total code entities in Supabase: ${count}`)
  console.log('\nMost recent entities:')
  if (recentEntities) {
    for (const entity of recentEntities) {
      console.log(`  ${entity.id}: ${entity.path} (${new Date(entity.created_at).toLocaleString()})`)
    }
  }
  
  // 2. Check code ingestion queue status
  console.log('\n\n=== Code Ingestion Queue Status ===')
  const { data: queueStatus } = await supabase.rpc('pgmq_metrics', {
    p_queue_name: 'code_ingestion'
  })
  
  if (queueStatus && queueStatus[0]) {
    console.log(`Queue length: ${queueStatus[0].queue_length || 0}`)
    console.log(`Oldest message: ${queueStatus[0].oldest_msg_age_sec || 0} seconds ago`)
  }
  
  // 3. Check recent code worker logs
  console.log('\n\n=== Recent Code Worker Activity ===')
  const { data: workerLogs } = await supabase
    .from('pattern_processor_logs')
    .select('created_at, level, message, metadata')
    .eq('message', 'Code ingestion worker started')
    .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(3)
  
  if (workerLogs && workerLogs.length > 0) {
    console.log(`Found ${workerLogs.length} recent worker starts`)
    for (const log of workerLogs) {
      console.log(`  ${new Date(log.created_at).toLocaleTimeString()}: ${log.metadata?.messageCount || 0} messages`)
    }
  }
  
  // 4. Check for processing logs
  console.log('\n\n=== Code Processing Logs ===')
  const { data: processingLogs } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .or('message.eq.Processing code entity,message.eq.Code entity processed successfully')
    .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(10)
  
  if (processingLogs && processingLogs.length > 0) {
    console.log(`Found ${processingLogs.length} processing logs`)
    for (const log of processingLogs) {
      console.log(`  [${new Date(log.created_at).toLocaleTimeString()}] ${log.message}`)
      if (log.metadata?.code_entity_id) {
        console.log(`    Entity: ${log.metadata.code_entity_id}`)
      }
    }
  } else {
    console.log('No processing logs found')
  }
  
  // 5. Check for Neo4j ingestion calls
  console.log('\n\n=== Neo4j Ingestion Logs ===')
  const { data: neo4jLogs } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .or('message.like.%Neo4j%,message.like.%ingest-code-to-neo4j%')
    .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(10)
  
  if (neo4jLogs && neo4jLogs.length > 0) {
    console.log(`Found ${neo4jLogs.length} Neo4j-related logs`)
    for (const log of neo4jLogs) {
      console.log(`  [${new Date(log.created_at).toLocaleTimeString()}] [${log.level}] ${log.message}`)
      if (log.error_stack) {
        console.log(`    Error: ${log.error_stack.split('\n')[0]}`)
      }
    }
  } else {
    console.log('No Neo4j-related logs found')
  }
  
  // 6. Check for errors
  console.log('\n\n=== Recent Errors ===')
  const { data: errorLogs } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .eq('level', 'error')
    .or('batch_id.like.%code%,message.like.%code%')
    .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(5)
  
  if (errorLogs && errorLogs.length > 0) {
    console.log(`Found ${errorLogs.length} errors`)
    for (const log of errorLogs) {
      console.log(`  [${new Date(log.created_at).toLocaleTimeString()}] ${log.message}`)
      if (log.error_stack) {
        console.log(`    ${log.error_stack.split('\n').slice(0, 2).join('\n    ')}`)
      }
    }
  }
  
  // 7. Sample queue message
  console.log('\n\n=== Sample Queue Message ===')
  const { data: sampleMsg } = await supabase.rpc('pgmq_read', {
    queue_name: 'code_ingestion',
    vt: 0,  // Don't lock it
    qty: 1
  })
  
  if (sampleMsg && sampleMsg[0]) {
    console.log('Message structure:')
    console.log(JSON.stringify(sampleMsg[0].message, null, 2))
  } else {
    console.log('No messages in queue')
  }
}

main().catch(console.error)