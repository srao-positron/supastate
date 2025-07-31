#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

async function checkCodeQueue() {
  console.log('=== Checking Code Queue System ===\n')

  // 1. Check if queue exists
  console.log('1. CHECKING QUEUE EXISTENCE:')
  const { data: queues, error: queueListError } = await supabase.rpc('pgmq_list_queues')
  
  if (queueListError) {
    console.error('Error listing queues:', queueListError)
  } else {
    console.log('Available queues:')
    queues?.forEach((queue: any) => {
      console.log(`  - ${queue.queue_name} (created: ${queue.created_at})`)
    })
  }

  // 2. Check code_ingestion queue specifically
  console.log('\n2. CODE_INGESTION QUEUE DETAILS:')
  try {
    // Try to read messages without claiming them
    const { data: peekMessages, error: peekError } = await supabase.rpc('pgmq_peek', {
      queue_name: 'code_ingestion',
      qty: 10
    })

    if (peekError) {
      console.error('Error peeking at queue:', peekError)
    } else if (peekMessages && peekMessages.length > 0) {
      console.log(`Found ${peekMessages.length} messages in queue:`)
      peekMessages.forEach((msg: any, idx: number) => {
        console.log(`\nMessage ${idx + 1} (ID: ${msg.msg_id}):`)
        console.log(`  VT: ${msg.vt}`)
        console.log(`  Read count: ${msg.read_ct}`)
        console.log(`  Enqueued at: ${msg.enqueued_at}`)
        
        const message = msg.message
        if (message.file_path) {
          console.log(`  File: ${message.file_path}`)
        }
        console.log(`  User ID: ${message.user_id}`)
        console.log(`  Workspace ID: ${message.workspace_id || 'null'}`)
        console.log(`  Content length: ${message.content?.length || 0} chars`)
      })
    } else {
      console.log('No messages found in code_ingestion queue')
    }
  } catch (error) {
    console.error('Error checking queue details:', error)
  }

  // 3. Check archive for processed messages
  console.log('\n3. CHECKING ARCHIVE FOR PROCESSED MESSAGES:')
  const { data: archiveMessages, error: archiveError } = await supabase.rpc('pgmq_peek_archive', {
    queue_name: 'code_ingestion',
    qty: 5
  })

  if (archiveError) {
    console.error('Error checking archive:', archiveError)
  } else if (archiveMessages && archiveMessages.length > 0) {
    console.log(`Found ${archiveMessages.length} archived messages`)
  } else {
    console.log('No archived messages found')
  }

  // 4. Check worker logs
  console.log('\n4. CHECKING WORKER LOGS:')
  const { data: workerLogs, error: workerLogsError } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .like('message', '%code%')
    .order('created_at', { ascending: false })
    .limit(5)

  if (workerLogsError) {
    console.error('Error checking worker logs:', workerLogsError)
  } else if (workerLogs && workerLogs.length > 0) {
    console.log('Recent code-related worker logs:')
    workerLogs.forEach(log => {
      console.log(`  - [${log.level}] ${log.message} (${log.created_at})`)
    })
  } else {
    console.log('No code-related worker logs found')
  }

  // 5. Check cron jobs
  console.log('\n5. CHECKING CRON JOBS:')
  const { data: cronJobs, error: cronError } = await supabase.rpc('cron_list')

  if (cronError) {
    console.error('Error checking cron jobs:', cronError)
  } else {
    const codeJobs = cronJobs?.filter((job: any) => 
      job.jobname.includes('code') || job.command.includes('code')
    )
    
    if (codeJobs && codeJobs.length > 0) {
      console.log('Code-related cron jobs:')
      codeJobs.forEach((job: any) => {
        console.log(`  - ${job.jobname}: ${job.schedule} (active: ${job.active})`)
      })
    } else {
      console.log('No code-related cron jobs found')
    }
  }

  // 6. Check if Camille user exists
  console.log('\n6. CHECKING FOR CAMILLE USER:')
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, full_name, created_at')
    .eq('id', 'a02c3fed-3a24-442f-becc-97bac8b75e90')

  if (profileError) {
    console.error('Error checking profiles:', profileError)
  } else if (profiles && profiles.length > 0) {
    console.log('Found user:')
    profiles.forEach(profile => {
      console.log(`  - ${profile.full_name || 'N/A'} (${profile.email})`)
      console.log(`    ID: ${profile.id}`)
      console.log(`    Created: ${profile.created_at}`)
    })
  }
}

checkCodeQueue().catch(console.error)