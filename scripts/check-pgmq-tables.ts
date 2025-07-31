#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkPgmqTables() {
  console.log('=== Checking pgmq Tables ===\n')
  
  // First check if we can list cron jobs now
  const { data: cronJobs, error: cronError } = await supabase.rpc('list_cron_jobs')
  
  if (!cronError && cronJobs) {
    console.log('✅ Cron helper functions are working!')
    console.log('\nActive cron jobs:')
    for (const job of cronJobs) {
      if (job.active) {
        console.log(`- ${job.jobname}: ${job.schedule}`)
      }
    }
  } else {
    console.log('❌ Cron helper functions not available yet')
  }
  
  // Check active cron jobs view
  const { data: activeJobs, error: viewError } = await supabase
    .from('active_cron_jobs')
    .select('*')
    
  if (!viewError && activeJobs) {
    console.log('\n✅ Active cron jobs view is accessible:')
    for (const job of activeJobs) {
      console.log(`- ${job.jobname} (${job.job_type}): ${job.schedule}`)
    }
  }
  
  // Check if we can access pgmq tables directly now
  console.log('\n=== Checking pgmq Tables Access ===')
  
  // Try to check pgmq.q table
  const { data: queueMetadata, error: qError } = await supabase
    .from('pgmq.q')
    .select('*')
    
  if (!qError && queueMetadata) {
    console.log('\n✅ pgmq.q table is accessible via PostgREST!')
    console.log('Queues:', queueMetadata.map(q => q.queue_name).join(', '))
  } else {
    console.log('❌ Cannot access pgmq.q:', qError?.message)
  }
  
  // Check queue status view
  const { data: queueStatus, error: statusError } = await supabase
    .from('pgmq_queue_status')
    .select('*')
    
  if (!statusError && queueStatus) {
    console.log('\n✅ Queue status view is accessible:')
    for (const queue of queueStatus) {
      console.log(`- ${queue.queue_name}: ${queue.queue_length || 0} messages`)
    }
  }
}

checkPgmqTables().catch(console.error)