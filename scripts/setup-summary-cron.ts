#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function setupCronJob() {
  console.log('Setting up cron job for project summary generation...')
  
  // First, let's manually trigger the function to test it
  console.log('Testing the generate-project-summaries function...')
  
  const { data, error } = await supabase.functions.invoke('generate-project-summaries', {
    body: { manual_trigger: true }
  })
  
  if (error) {
    console.error('Error invoking function:', error)
  } else {
    console.log('Function response:', data)
  }
  
  // Note: Supabase cron jobs are typically set up via SQL in migrations
  // or through the Supabase dashboard. Here's the SQL that would be needed:
  console.log(`
To set up the cron job, run this SQL in Supabase:

SELECT cron.schedule(
  'generate-project-summaries',
  '*/15 * * * *', -- Every 15 minutes
  $$
    SELECT net.http_post(
      url := 'https://${supabaseUrl.replace('https://', '')}/functions/v1/generate-project-summaries',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ${supabaseServiceKey}'
      ),
      body := jsonb_build_object('trigger', 'cron')
    );
  $$
);

To unschedule:
SELECT cron.unschedule('generate-project-summaries');
  `)
}

setupCronJob().catch(console.error)