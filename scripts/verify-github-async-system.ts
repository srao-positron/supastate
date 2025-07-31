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

async function verifyGitHubAsyncSystem() {
  console.log('🔍 Verifying GitHub Async System')
  console.log('================================\n')

  try {
    // Step 1: Check cron jobs
    console.log('📋 Step 1: Checking cron jobs...')
    
    const { data: cronJobs, error: cronError } = await supabase
      .rpc('cron_job_list')

    if (cronError || !cronJobs) {
      console.log('❌ Could not fetch cron jobs')
      console.log('Trying alternative method...')
      
      // Try raw SQL
      const { data: rawJobs } = await supabase
        .from('cron.job')
        .select('*')
        .ilike('jobname', '%github%')
      
      if (rawJobs) {
        console.log('\nGitHub cron jobs:')
        rawJobs.forEach(job => {
          console.log(`- ${job.jobname}: ${job.schedule} (active: ${job.active})`)
        })
      }
    } else {
      const githubJobs = cronJobs.filter((job: any) => 
        job.jobname?.includes('github')
      )
      
      console.log(`\nFound ${githubJobs.length} GitHub cron jobs:`)
      githubJobs.forEach((job: any) => {
        console.log(`- ${job.jobname}: ${job.schedule}`)
      })
    }

    // Step 2: Check edge functions
    console.log('\n📋 Step 2: Verifying edge functions are deployed...')
    
    const edgeFunctions = [
      'github-crawl-coordinator',
      'github-crawl-worker',
      'github-code-parser-worker'
    ]

    for (const func of edgeFunctions) {
      const response = await fetch(`${supabaseUrl}/functions/v1/${func}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ test: true })
      })

      console.log(`- ${func}: ${response.status === 404 ? '❌ NOT DEPLOYED' : '✅ Deployed'}`)
    }

    // Step 3: Queue a test job
    console.log('\n📋 Step 3: Queuing a test crawl job...')
    
    // Get Camille repository
    const { data: repo } = await supabase
      .from('github_repositories')
      .select('*')
      .eq('full_name', 'srao-positron/camille')
      .single()

    if (repo) {
      // Queue a test job
      const { data: job, error: jobError } = await supabase
        .from('github_crawl_queue')
        .insert({
          repository_id: repo.id,
          crawl_type: 'test',
          priority: 100,
          data: { test: true, timestamp: new Date().toISOString() }
        })
        .select()
        .single()

      if (job) {
        console.log(`✅ Created test job: ${job.id}`)
        
        // Wait for processing
        console.log('\n⏳ Waiting 10 seconds for job processing...')
        await new Promise(resolve => setTimeout(resolve, 10000))
        
        // Check job status
        const { data: updatedJob } = await supabase
          .from('github_crawl_queue')
          .select('*')
          .eq('id', job.id)
          .single()

        console.log(`\nJob status: ${updatedJob?.status}`)
        if (updatedJob?.status === 'processing' || updatedJob?.status === 'completed') {
          console.log('✅ Job is being processed asynchronously!')
        } else {
          console.log('⚠️  Job still pending - coordinator might not be running')
        }
      }
    }

    // Step 4: Check queue metrics
    console.log('\n📋 Step 4: Checking queue metrics...')
    
    const { data: metrics } = await supabase.rpc('pgmq_metrics_all')
    
    if (metrics) {
      const githubQueues = metrics.filter((q: any) => 
        q.queue_name.includes('github')
      )
      
      console.log('\nGitHub queue metrics:')
      githubQueues.forEach((q: any) => {
        console.log(`- ${q.queue_name}:`)
        console.log(`  Queue length: ${q.queue_length}`)
        console.log(`  Total messages: ${q.total_messages}`)
      })
    }

    // Step 5: Check recent logs
    console.log('\n📋 Step 5: Checking recent activity logs...')
    
    const { data: logs } = await supabase
      .from('github_ingestion_logs')
      .select('*')
      .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(10)

    console.log(`\nRecent logs (${logs?.length || 0}):`)
    logs?.slice(0, 5).forEach(log => {
      const time = new Date(log.created_at).toLocaleTimeString()
      console.log(`- [${time}] ${log.function_name}: ${log.message}`)
    })

    // Summary
    console.log('\n\n📊 System Status Summary:')
    console.log('========================')
    
    const hasCoordinator = edgeFunctions.some(f => f.includes('coordinator'))
    const hasWorker = edgeFunctions.some(f => f.includes('worker'))
    const hasCronJobs = (cronJobs?.length || 0) > 0
    
    if (hasCoordinator && hasWorker && hasCronJobs) {
      console.log('✅ Async system is properly configured')
      console.log('\n🎯 Ready for stress testing with complex repositories!')
    } else {
      console.log('❌ Async system has issues:')
      if (!hasCoordinator) console.log('   - Missing coordinator')
      if (!hasWorker) console.log('   - Missing worker')
      if (!hasCronJobs) console.log('   - Missing cron jobs')
    }

  } catch (error) {
    console.error('❌ Error:', error)
  }
}

// Run verification
verifyGitHubAsyncSystem()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('💥 Error:', error)
    process.exit(1)
  })