#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function setupCronJobs() {
  console.log('=== Setting Up Cron Jobs ===\n')
  
  // Check existing cron jobs
  const { data: existingJobs, error: listError } = await supabase
    .from('cron.job')
    .select('jobname, schedule, active')
    
  if (listError) {
    console.error('Error listing cron jobs:', listError)
    return
  }
  
  console.log('Existing cron jobs:')
  if (existingJobs && existingJobs.length > 0) {
    for (const job of existingJobs) {
      console.log(`- ${job.jobname}: ${job.schedule} (active: ${job.active})`)
    }
  } else {
    console.log('No cron jobs found')
  }
  
  // Create the cron jobs via SQL
  console.log('\nCreating queue worker cron jobs...')
  
  const cronSQL = `
    -- Memory ingestion worker (every 15 seconds)
    SELECT cron.schedule(
      'memory-ingestion-worker',
      '*/15 * * * *',  -- Every 15 seconds
      $$
      SELECT extensions.http_post(
        url => 'https://zqlfxakbkwssxfynrmnk.supabase.co/functions/v1/memory-ingestion-worker',
        headers => json_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.jwt_secret'),
          'Content-Type', 'application/json'
        )::extensions.http_header[],
        body => '{}'::jsonb
      ) AS request_id;
      $$
    );
    
    -- Pattern detection worker (every 15 seconds)
    SELECT cron.schedule(
      'pattern-detection-worker',
      '*/15 * * * *',  -- Every 15 seconds
      $$
      SELECT extensions.http_post(
        url => 'https://zqlfxakbkwssxfynrmnk.supabase.co/functions/v1/pattern-detection-worker',
        headers => json_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.jwt_secret'),
          'Content-Type', 'application/json'
        )::extensions.http_header[],
        body => '{}'::jsonb
      ) AS request_id;
      $$
    );
  `
  
  // Note: Can't execute raw SQL through Supabase client
  console.log('\nTo create the cron jobs, run this SQL in the Supabase Dashboard:')
  console.log(cronSQL)
  
  // Check if edge functions are deployed
  console.log('\n=== Checking Edge Functions ===')
  const edgeFunctions = [
    'memory-ingestion-worker',
    'pattern-detection-worker',
    'code-ingestion-worker'
  ]
  
  console.log('\nMake sure these edge functions are deployed:')
  for (const func of edgeFunctions) {
    console.log(`- ${func}`)
  }
  
  console.log('\nTo trigger workers manually for testing:')
  console.log('curl -X POST https://zqlfxakbkwssxfynrmnk.supabase.co/functions/v1/memory-ingestion-worker \\')
  console.log('  -H "Authorization: Bearer YOUR_ANON_KEY" \\')
  console.log('  -H "Content-Type: application/json"')
}

setupCronJobs().catch(console.error)