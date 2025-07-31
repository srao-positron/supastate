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

// Test repositories of increasing complexity
const TEST_REPOS = [
  {
    name: 'Small TypeScript Library',
    url: 'https://github.com/sindresorhus/type-fest',
    expectedSize: 'small',
    branches: ['main']
  },
  {
    name: 'Medium React Component Library',
    url: 'https://github.com/radix-ui/primitives',
    expectedSize: 'medium',
    branches: ['main', 'dev']
  },
  {
    name: 'Large TypeScript Project',
    url: 'https://github.com/microsoft/vscode',
    expectedSize: 'large',
    branches: ['main', 'release/1.85']
  }
]

async function stressTestGitHubCrawl() {
  console.log('🏋️ GitHub Crawl Stress Test')
  console.log('===========================\n')

  try {
    // Get user
    const { data: users } = await supabase
      .from('users')
      .select('id')
      .limit(1)
    
    const userId = users![0].id

    // Test 1: Check if crawl is truly async
    console.log('📊 Test 1: Verifying Asynchronous Architecture\n')
    
    // Import a test repository
    const testRepo = TEST_REPOS[0] // Start with small repo
    console.log(`Importing ${testRepo.name}: ${testRepo.url}`)
    
    const startTime = Date.now()
    
    const importResponse = await fetch('http://localhost:3000/api/github/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({
        repository_url: testRepo.url,
        user_id: userId,
        force_refresh: true
      })
    })

    const importTime = Date.now() - startTime
    console.log(`Import API returned in: ${importTime}ms`)
    
    if (importTime > 5000) {
      console.log('⚠️  WARNING: Import took > 5 seconds, might be synchronous!')
    } else {
      console.log('✅ Import returned quickly, likely queued')
    }

    if (!importResponse.ok) {
      console.log('❌ Import failed:', await importResponse.text())
      return
    }

    const importResult = await importResponse.json()
    const repositoryId = importResult.repository?.id

    if (!repositoryId) {
      console.log('❌ No repository ID returned')
      return
    }

    // Test 2: Monitor queue processing
    console.log('\n📊 Test 2: Queue Processing Analysis\n')
    
    // Check crawl queue
    const { data: crawlJobs } = await supabase
      .from('github_crawl_queue')
      .select('*')
      .eq('repository_id', repositoryId)
      .order('created_at', { ascending: false })
      .limit(5)

    console.log(`Crawl jobs queued: ${crawlJobs?.length || 0}`)
    crawlJobs?.forEach(job => {
      console.log(`- ${job.crawl_type} (${job.status}) - Priority: ${job.priority}`)
    })

    // Wait and check if jobs are being processed
    console.log('\nWaiting 10 seconds to check if jobs are processed...')
    await new Promise(resolve => setTimeout(resolve, 10000))

    const { data: jobsAfterWait } = await supabase
      .from('github_crawl_queue')
      .select('*')
      .eq('repository_id', repositoryId)
      .order('created_at', { ascending: false })
      .limit(5)

    const pendingJobs = jobsAfterWait?.filter(j => j.status === 'pending') || []
    const processingJobs = jobsAfterWait?.filter(j => j.status === 'processing') || []
    const completedJobs = jobsAfterWait?.filter(j => j.status === 'completed') || []

    console.log('\nQueue status after wait:')
    console.log(`- Pending: ${pendingJobs.length}`)
    console.log(`- Processing: ${processingJobs.length}`)
    console.log(`- Completed: ${completedJobs.length}`)

    if (pendingJobs.length === crawlJobs?.length) {
      console.log('❌ CRITICAL: No jobs processed! Coordinator might not be running')
    }

    // Test 3: Check code parsing queue
    console.log('\n📊 Test 3: Code Parsing Queue Status\n')
    
    // Check PGMQ queue status
    const { data: queueMetrics } = await supabase.rpc('pgmq_metrics_all')
    
    const codeParsingQueue = queueMetrics?.find((q: any) => q.queue_name === 'github_code_parsing')
    if (codeParsingQueue) {
      console.log('GitHub code parsing queue:')
      console.log(`- Queue length: ${codeParsingQueue.queue_length}`)
      console.log(`- Newest message age: ${codeParsingQueue.newest_msg_age_sec}s`)
      console.log(`- Oldest message age: ${codeParsingQueue.oldest_msg_age_sec}s`)
      console.log(`- Total messages: ${codeParsingQueue.total_messages}`)
    }

    // Test 4: Check ingestion logs
    console.log('\n📊 Test 4: Checking Ingestion Logs\n')
    
    const { data: logs } = await supabase
      .from('github_ingestion_logs')
      .select('*')
      .eq('repository_id', repositoryId)
      .order('created_at', { ascending: false })
      .limit(10)

    console.log(`Recent log entries: ${logs?.length || 0}`)
    logs?.slice(0, 5).forEach(log => {
      console.log(`- [${log.level}] ${log.message}`)
    })

    // Test 5: Stress test readiness
    console.log('\n📊 Test 5: System Stress Test Readiness\n')
    
    console.log('Checking for larger repository support...')
    
    // Check if coordinator is scheduled
    const { data: cronJobs } = await supabase
      .from('cron_jobs')
      .select('*')
      .eq('name', 'invoke-github-crawl-coordinator')
      .single()

    if (!cronJobs) {
      console.log('❌ No cron job for GitHub crawl coordinator!')
      console.log('   System cannot process crawl queue automatically')
    } else {
      console.log(`✅ Cron job exists: ${cronJobs.schedule} (${cronJobs.active ? 'active' : 'inactive'})`)
    }

    // Summary
    console.log('\n📋 Stress Test Summary:')
    console.log('========================')
    
    const issues = []
    
    if (!cronJobs) {
      issues.push('No automated processing - need cron job for coordinator')
    }
    
    if (pendingJobs.length === crawlJobs?.length) {
      issues.push('Jobs not being processed - coordinator not running')
    }
    
    if (importTime > 5000) {
      issues.push('Import might be synchronous - risk of timeouts')
    }

    if (issues.length > 0) {
      console.log('\n⚠️  ISSUES FOUND:')
      issues.forEach(issue => console.log(`   - ${issue}`))
      console.log('\n❌ System is NOT ready for large repositories')
    } else {
      console.log('\n✅ System appears ready for stress testing')
    }

    // Recommendations
    console.log('\n🔧 Recommendations:')
    console.log('1. Create cron job to run github-crawl-coordinator every minute')
    console.log('2. Verify github-crawl-worker is processing jobs')
    console.log('3. Monitor queue depth during large repo imports')
    console.log('4. Implement progressive crawling for very large repos')
    console.log('5. Add timeout handling and retry logic')

  } catch (error) {
    console.error('❌ Stress test error:', error)
  }
}

// Run the stress test
stressTestGitHubCrawl()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('💥 Error:', error)
    process.exit(1)
  })