#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function setupQueueCronJobs() {
  console.log('=== Setting Up Queue Worker Cron Jobs ===\n')
  
  // List current cron jobs
  const { data: currentJobs, error: listError } = await supabase.rpc('list_cron_jobs')
  
  if (listError) {
    console.error('Error listing cron jobs:', listError)
    return
  }
  
  console.log('Current cron jobs:')
  for (const job of currentJobs || []) {
    console.log(`- ${job.jobname}: ${job.schedule} (active: ${job.active})`)
  }
  
  // Unschedule old pattern detection jobs
  console.log('\n=== Unscheduling Old Jobs ===')
  const oldJobs = [
    'process-pattern-queue',
    'pattern-detection-5min'
  ]
  
  for (const jobName of oldJobs) {
    const { error } = await supabase.rpc('unschedule_cron_job', {
      p_jobname: jobName
    })
    
    if (error) {
      console.log(`Could not unschedule ${jobName}:`, error.message)
    } else {
      console.log(`✅ Unscheduled ${jobName}`)
    }
  }
  
  // Schedule new queue worker jobs
  console.log('\n=== Scheduling New Queue Worker Jobs ===')
  
  const newJobs = [
    {
      name: 'memory-ingestion-worker',
      schedule: '* * * * *', // Every minute
      command: `
        SELECT net.http_post(
          url := 'https://zqlfxakbkwssxfynrmnk.supabase.co/functions/v1/memory-ingestion-worker',
          headers := jsonb_build_object(
            'Authorization', 'Bearer ' || current_setting('app.settings.supabase_anon_key'),
            'Content-Type', 'application/json'
          ),
          body := '{}'::jsonb
        ) AS request_id;
      `
    },
    {
      name: 'pattern-detection-worker',
      schedule: '* * * * *', // Every minute
      command: `
        SELECT net.http_post(
          url := 'https://zqlfxakbkwssxfynrmnk.supabase.co/functions/v1/pattern-detection-worker',
          headers := jsonb_build_object(
            'Authorization', 'Bearer ' || current_setting('app.settings.supabase_anon_key'),
            'Content-Type', 'application/json'
          ),
          body := '{}'::jsonb
        ) AS request_id;
      `
    },
    {
      name: 'code-ingestion-worker', 
      schedule: '* * * * *', // Every minute
      command: `
        SELECT net.http_post(
          url := 'https://zqlfxakbkwssxfynrmnk.supabase.co/functions/v1/code-ingestion-worker',
          headers := jsonb_build_object(
            'Authorization', 'Bearer ' || current_setting('app.settings.supabase_anon_key'),
            'Content-Type', 'application/json'
          ),
          body := '{}'::jsonb
        ) AS request_id;
      `
    }
  ]
  
  for (const job of newJobs) {
    const { data: jobId, error } = await supabase.rpc('schedule_cron_job', {
      p_jobname: job.name,
      p_schedule: job.schedule,
      p_command: job.command.trim()
    })
    
    if (error) {
      console.error(`❌ Failed to schedule ${job.name}:`, error.message)
    } else {
      console.log(`✅ Scheduled ${job.name} (job ID: ${jobId})`)
    }
  }
  
  // List updated cron jobs
  console.log('\n=== Updated Cron Jobs ===')
  const { data: updatedJobs } = await supabase.rpc('list_cron_jobs')
  
  for (const job of updatedJobs || []) {
    if (job.active) {
      console.log(`- ${job.jobname}: ${job.schedule}`)
    }
  }
  
  console.log('\n✅ Cron jobs setup complete!')
  console.log('\nThe workers will now run every minute and process messages from the queues.')
  console.log('You can monitor worker activity in the pattern_processor_logs table.')
}

setupQueueCronJobs().catch(console.error)