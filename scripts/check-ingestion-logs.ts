#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

async function checkIngestionLogs() {
  console.log('=== Checking Ingestion Logs ===\n')
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  // Check memory ingestion logs
  const { data: memoryLogs, error: memoryError } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .or('message.ilike.%memory%,message.ilike.%ingestion%,function_name.ilike.%ingest%')
    .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(20)
    
  if (memoryError) {
    console.error('Error fetching memory logs:', memoryError)
  } else if (memoryLogs && memoryLogs.length > 0) {
    console.log(`Found ${memoryLogs.length} ingestion-related logs:\n`)
    
    for (const log of memoryLogs) {
      const time = new Date(log.created_at).toLocaleTimeString()
      console.log(`[${time}] [${log.function_name || 'unknown'}] [${log.level}] ${log.message}`)
      if (log.details && Object.keys(log.details).length > 0) {
        console.log(`  Details:`, JSON.stringify(log.details, null, 2))
      }
      if (log.error_stack) {
        console.log(`  Error:`, log.error_stack.split('\n')[0])
      }
    }
  } else {
    console.log('No ingestion logs found in the last 10 minutes')
  }
  
  // Check memories table for recent entries
  console.log('\n=== Recent Memories ===')
  const { data: memories } = await supabase
    .from('memories')
    .select('id, project_name, created_at, user_id, chunk_id')
    .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(5)
    
  if (memories && memories.length > 0) {
    console.log(`Found ${memories.length} recent memories:`)
    for (const mem of memories) {
      console.log(`- ${mem.project_name} (${new Date(mem.created_at).toLocaleTimeString()}) - chunk: ${mem.chunk_id}`)
    }
  } else {
    console.log('No memories created in the last 10 minutes')
  }
  
  // Check queue messages
  console.log('\n=== Queue Status ===')
  
  // Check memory ingestion queue
  const { data: memoryQueue } = await supabase.rpc('pgmq_read', {
    queue_name: 'memory_ingestion',
    vt: 0, // Just peek, don't lock
    qty: 5
  })
  
  if (memoryQueue && memoryQueue.length > 0) {
    console.log(`Memory ingestion queue has ${memoryQueue.length} messages waiting`)
  } else {
    console.log('Memory ingestion queue is empty')
  }
  
  // Check pattern detection queue  
  const { data: patternQueue } = await supabase.rpc('pgmq_read', {
    queue_name: 'pattern_detection',
    vt: 0,
    qty: 5
  })
  
  if (patternQueue && patternQueue.length > 0) {
    console.log(`Pattern detection queue has ${patternQueue.length} messages waiting`)
  } else {
    console.log('Pattern detection queue is empty')
  }
}

checkIngestionLogs().catch(console.error)