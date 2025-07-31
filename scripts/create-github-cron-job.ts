#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function createGitHubCronJobs() {
  console.log('🔧 Creating GitHub Cron Jobs')
  console.log('===========================\n')

  try {
    // First, check existing cron jobs
    const { data: existingJobs } = await supabase
      .from('cron_jobs')
      .select('*')
      .order('created_at', { ascending: false })

    console.log('📋 Existing cron jobs:')
    existingJobs?.forEach(job => {
      console.log(`- ${job.name}: ${job.schedule} (${job.active ? 'active' : 'inactive'})`)
    })

    // Create GitHub crawl coordinator cron job
    console.log('\n🚀 Creating GitHub crawl coordinator cron job...')
    
    const crawlCoordinatorJob = {
      name: 'invoke-github-crawl-coordinator',
      schedule: '* * * * *', // Every minute
      command: "SELECT net.http_post(url:='https://zqlfxakbkwssxfynrmnk.supabase.co/functions/v1/github-crawl-coordinator', headers:=jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'), 'Content-Type', 'application/json'), body:=jsonb_build_object('trigger', 'cron'))::jsonb",
      active: true
    }

    const { error: crawlError } = await supabase
      .from('cron_jobs')
      .upsert(crawlCoordinatorJob, {
        onConflict: 'name'
      })

    if (crawlError) {
      console.error('❌ Failed to create crawl coordinator job:', crawlError)
    } else {
      console.log('✅ Created github-crawl-coordinator cron job (runs every minute)')
    }

    // Create GitHub code parser worker cron job
    console.log('\n🚀 Creating GitHub code parser worker cron job...')
    
    const parserWorkerJob = {
      name: 'invoke-github-code-parser-worker',
      schedule: '* * * * *', // Every minute
      command: "SELECT net.http_post(url:='https://zqlfxakbkwssxfynrmnk.supabase.co/functions/v1/github-code-parser-worker', headers:=jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'), 'Content-Type', 'application/json'), body:=jsonb_build_object('trigger', 'cron', 'batch_size', 10))::jsonb",
      active: true
    }

    const { error: parserError } = await supabase
      .from('cron_jobs')
      .upsert(parserWorkerJob, {
        onConflict: 'name'
      })

    if (parserError) {
      console.error('❌ Failed to create parser worker job:', parserError)
    } else {
      console.log('✅ Created github-code-parser-worker cron job (runs every minute)')
    }

    // Check cron extension is enabled
    console.log('\n🔍 Verifying pg_cron extension...')
    
    const { data: extensions } = await supabase
      .rpc('pg_available_extensions')
      .eq('name', 'pg_cron')
      .single()

    if (extensions?.installed_version) {
      console.log('✅ pg_cron extension is installed')
    } else {
      console.log('❌ pg_cron extension is not installed!')
      console.log('   Run this in SQL Editor: CREATE EXTENSION IF NOT EXISTS pg_cron;')
    }

    // Verify jobs were created
    console.log('\n📋 Updated cron job list:')
    const { data: updatedJobs } = await supabase
      .from('cron_jobs')
      .select('*')
      .order('created_at', { ascending: false })

    updatedJobs?.forEach(job => {
      console.log(`- ${job.name}: ${job.schedule} (${job.active ? 'active' : 'inactive'})`)
    })

    // Test manual trigger
    console.log('\n🧪 Testing manual trigger of coordinator...')
    
    const response = await fetch(`${supabaseUrl}/functions/v1/github-crawl-coordinator`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ trigger: 'manual-test' })
    })

    console.log(`Response: ${response.status} ${response.statusText}`)
    if (response.ok) {
      const result = await response.json()
      console.log('Result:', result)
    }

    console.log('\n✅ GitHub cron jobs setup complete!')
    console.log('\n📊 What happens now:')
    console.log('1. Every minute, the coordinator checks for pending crawl jobs')
    console.log('2. It dispatches jobs to the crawl worker')
    console.log('3. The crawl worker fetches data from GitHub')
    console.log('4. Files are queued for parsing')
    console.log('5. The parser worker processes files asynchronously')

  } catch (error) {
    console.error('❌ Error:', error)
  }
}

// Run the setup
createGitHubCronJobs()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('💥 Error:', error)
    process.exit(1)
  })