#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

async function checkWorkers() {
  console.log('=== CHECKING WORKER STATUS ===\n')
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  // 1. Check queue messages
  console.log('📬 QUEUE MESSAGES:')
  
  // Read a message from memory_ingestion queue
  const { data: memoryMsg } = await supabase.rpc('pgmq_read', {
    queue_name: 'memory_ingestion',
    vt: 0, // Don't claim it
    qty: 1
  })
  
  if (memoryMsg && memoryMsg.length > 0) {
    console.log('\nSample memory_ingestion message:')
    console.log(JSON.stringify(memoryMsg[0], null, 2))
  }
  
  // 2. Check if workers are processing
  console.log('\n\n🔧 TESTING WORKERS:')
  
  // Try to invoke the memory-ingestion-worker directly
  const workerUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/memory-ingestion-worker`
  
  console.log('\nInvoking memory-ingestion-worker...')
  try {
    const response = await fetch(workerUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    })
    
    const result = await response.text()
    console.log('Response status:', response.status)
    console.log('Response:', result)
  } catch (error) {
    console.error('Error invoking worker:', error)
  }
  
  // 3. Check pattern detection logs
  console.log('\n\n📋 PATTERN PROCESSOR LOGS:')
  const { data: logs } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5)
    
  if (logs && logs.length > 0) {
    for (const log of logs) {
      console.log(`[${log.level}] ${log.message}`)
    }
  } else {
    console.log('No pattern processor logs found')
  }
  
  // 4. Check if there's a cron job running
  console.log('\n\n⏰ CHECKING FOR CRON JOBS:')
  console.log('Run this SQL in Supabase dashboard to check cron jobs:')
  console.log(`
SELECT 
  jobname,
  schedule,
  active,
  jobid
FROM cron.job
WHERE jobname LIKE '%pattern%' OR jobname LIKE '%memory%' OR jobname LIKE '%worker%';
`)
}

checkWorkers().catch(console.error)