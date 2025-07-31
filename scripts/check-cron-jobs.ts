#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkCronJobs() {
  console.log('=== Checking Cron Jobs ===\n')
  
  // pg_cron stores jobs in the cron schema, not public
  // We need to use a function or direct query
  
  // Method 1: Try via cron.job_cache if it exists
  const { data: jobCache, error: cacheError } = await supabase
    .from('cron.job_cache')
    .select('*')
    
  if (!cacheError && jobCache) {
    console.log('Found jobs in cache:', jobCache)
  }
  
  // Method 2: Create a function to list cron jobs
  const createListFunction = `
    CREATE OR REPLACE FUNCTION public.list_cron_jobs()
    RETURNS TABLE (
      jobid bigint,
      schedule text,
      command text,
      nodename text,
      nodeport integer,
      database text,
      username text,
      active boolean,
      jobname text
    )
    LANGUAGE sql
    SECURITY DEFINER
    AS $$
      SELECT jobid, schedule, command, nodename, nodeport, database, username, active, jobname
      FROM cron.job
      ORDER BY jobid;
    $$;
  `
  
  console.log('To list cron jobs, first create this function in SQL Editor:')
  console.log(createListFunction)
  
  // Try to call the function if it exists
  const { data: jobs, error: jobError } = await supabase.rpc('list_cron_jobs')
  
  if (!jobError && jobs) {
    console.log('\nActive cron jobs:')
    for (const job of jobs) {
      if (job.active) {
        console.log(`\n📅 ${job.jobname || `Job ${job.jobid}`}`)
        console.log(`   Schedule: ${job.schedule}`)
        console.log(`   Command: ${job.command.substring(0, 100)}...`)
      }
    }
  } else if (jobError) {
    console.log('\nCould not list cron jobs directly. Error:', jobError.message)
  }
  
  // Method 3: Check our pattern processor logs to see if cron is running
  console.log('\n=== Recent Cron Activity ===')
  const { data: logs, error: logError } = await supabase
    .from('pattern_processor_logs')
    .select('created_at, message')
    .in('message', [
      'Memory ingestion worker started',
      'Pattern detection worker started',
      'Code ingestion worker started'
    ])
    .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(10)
    
  if (logs && logs.length > 0) {
    console.log('\nRecent worker starts:')
    for (const log of logs) {
      const time = new Date(log.created_at).toLocaleTimeString()
      console.log(`[${time}] ${log.message}`)
    }
  } else {
    console.log('No recent worker activity in logs')
  }
  
  // Show SQL to create/update cron jobs
  console.log('\n=== SQL to Create Queue Worker Cron Jobs ===')
  console.log(`
-- First, remove old cron jobs if they exist
SELECT cron.unschedule('process-pattern-queue');
SELECT cron.unschedule('memory-ingestion-worker');
SELECT cron.unschedule('pattern-detection-worker');
SELECT cron.unschedule('code-ingestion-worker');

-- Create new cron jobs for queue workers (every minute)
SELECT cron.schedule(
  'memory-ingestion-worker',
  '* * * * *',  -- Every minute
  $$
  SELECT net.http_post(
    url := 'https://zqlfxakbkwssxfynrmnk.supabase.co/functions/v1/memory-ingestion-worker',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.supabase_anon_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'pattern-detection-worker', 
  '* * * * *',  -- Every minute
  $$
  SELECT net.http_post(
    url := 'https://zqlfxakbkwssxfynrmnk.supabase.co/functions/v1/pattern-detection-worker',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.supabase_anon_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'code-ingestion-worker',
  '* * * * *',  -- Every minute
  $$
  SELECT net.http_post(
    url := 'https://zqlfxakbkwssxfynrmnk.supabase.co/functions/v1/code-ingestion-worker',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.supabase_anon_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
  `)
}

checkCronJobs().catch(console.error)