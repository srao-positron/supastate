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

async function auditGitHubAsyncSystem() {
  console.log('🔍 GitHub Async System Audit')
  console.log('============================\n')

  const issues: string[] = []
  const successes: string[] = []

  try {
    // 1. Check Edge Functions
    console.log('📦 1. Checking Edge Functions Deployment Status...\n')
    
    const requiredFunctions = [
      'github-crawl-coordinator',
      'github-crawl-worker',
      'github-code-parser-worker'
    ]

    for (const func of requiredFunctions) {
      const response = await fetch(`${supabaseUrl}/functions/v1/${func}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ test: true })
      })

      if (response.status === 404) {
        console.log(`❌ ${func}: NOT DEPLOYED`)
        issues.push(`Edge function ${func} is not deployed`)
      } else {
        console.log(`✅ ${func}: Deployed (status: ${response.status})`)
        successes.push(`Edge function ${func} is deployed`)
      }
    }

    // 2. Check PGMQ Queues
    console.log('\n📬 2. Checking PGMQ Queues...\n')
    
    const { data: queues, error: queueError } = await supabase.rpc('pgmq_list_queues')
    
    if (queueError) {
      console.log('❌ Failed to list PGMQ queues:', queueError.message)
      issues.push('Cannot access PGMQ queues')
    } else {
      const requiredQueues = ['github_crawl', 'github_code_parsing']
      
      for (const queueName of requiredQueues) {
        if (queues?.includes(queueName)) {
          console.log(`✅ ${queueName}: Exists`)
          successes.push(`PGMQ queue ${queueName} exists`)
          
          // Check queue metrics
          const { data: metrics } = await supabase.rpc('pgmq_metrics', {
            queue_name: queueName
          })
          
          if (metrics) {
            console.log(`   - Queue length: ${metrics.queue_length}`)
            console.log(`   - Total messages: ${metrics.total_messages}`)
          }
        } else {
          console.log(`❌ ${queueName}: MISSING`)
          issues.push(`PGMQ queue ${queueName} is missing`)
        }
      }
    }

    // 3. Check Database Tables
    console.log('\n📊 3. Checking Database Tables...\n')
    
    const requiredTables = [
      'github_repositories',
      'github_crawl_queue',
      'github_indexed_branches',
      'github_ingestion_logs'
    ]

    for (const tableName of requiredTables) {
      const { data, error } = await supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true })
      
      if (error) {
        console.log(`❌ ${tableName}: MISSING or inaccessible`)
        issues.push(`Table ${tableName} is missing or inaccessible`)
      } else {
        console.log(`✅ ${tableName}: Exists`)
        successes.push(`Table ${tableName} exists`)
      }
    }

    // 4. Check Cron Jobs
    console.log('\n⏰ 4. Checking Cron Jobs...\n')
    
    const { data: cronJobs } = await supabase.rpc('cron_job_list')
    
    if (!cronJobs) {
      console.log('❌ Cannot access cron jobs')
      issues.push('Cannot access cron jobs')
    } else {
      const requiredCronJobs = [
        'github-crawl-coordinator',
        'github-code-parser-worker'
      ]
      
      for (const jobName of requiredCronJobs) {
        const job = cronJobs.find((j: any) => j.jobname === jobName)
        if (job) {
          console.log(`✅ ${jobName}: Scheduled (${job.schedule})`)
          successes.push(`Cron job ${jobName} is scheduled`)
        } else {
          console.log(`❌ ${jobName}: NOT SCHEDULED`)
          issues.push(`Cron job ${jobName} is not scheduled`)
        }
      }
    }

    // 5. Check RPC Functions
    console.log('\n🔧 5. Checking RPC Functions...\n')
    
    // Test queue_github_crawl function
    const { error: queueFuncError } = await supabase.rpc('queue_github_crawl', {
      p_repository_id: '00000000-0000-0000-0000-000000000000',
      p_crawl_type: 'test',
      p_priority: 10,
      p_data: {}
    })
    
    if (queueFuncError) {
      if (queueFuncError.message.includes('does not exist')) {
        console.log('❌ queue_github_crawl: MISSING')
        issues.push('RPC function queue_github_crawl is missing')
      } else {
        console.log('✅ queue_github_crawl: Exists (test failed due to FK constraint)')
        successes.push('RPC function queue_github_crawl exists')
      }
    } else {
      console.log('✅ queue_github_crawl: Working')
      successes.push('RPC function queue_github_crawl is working')
    }

    // 6. Check Recent Activity
    console.log('\n📈 6. Checking Recent Activity...\n')
    
    // Check crawl queue activity
    const { data: crawlQueue, count: crawlCount } = await supabase
      .from('github_crawl_queue')
      .select('*', { count: 'exact', head: false })
      .order('created_at', { ascending: false })
      .limit(5)
    
    console.log(`GitHub crawl queue: ${crawlCount || 0} total items`)
    if (crawlQueue && crawlQueue.length > 0) {
      console.log('Recent items:')
      crawlQueue.forEach(item => {
        console.log(`- ${item.crawl_type} (${item.status}) - ${new Date(item.created_at).toLocaleString()}`)
      })
    }

    // Check logs
    const { data: logs } = await supabase
      .from('github_ingestion_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5)
    
    if (logs && logs.length > 0) {
      console.log('\nRecent logs:')
      logs.forEach(log => {
        console.log(`- [${log.level}] ${log.function_name}: ${log.message}`)
      })
    } else {
      console.log('\nNo recent logs found')
    }

    // Summary
    console.log('\n\n📋 AUDIT SUMMARY')
    console.log('================\n')
    
    console.log(`✅ Working Components (${successes.length})`)
    successes.forEach(s => console.log(`   - ${s}`))
    
    if (issues.length > 0) {
      console.log(`\n❌ Issues Found (${issues.length})`)
      issues.forEach(i => console.log(`   - ${i}`))
      
      console.log('\n🔧 REQUIRED ACTIONS:')
      
      if (issues.some(i => i.includes('Edge function'))) {
        console.log('\n1. Deploy missing edge functions:')
        requiredFunctions.forEach(f => {
          if (issues.some(i => i.includes(f))) {
            console.log(`   npx supabase functions deploy ${f}`)
          }
        })
      }
      
      if (issues.some(i => i.includes('PGMQ queue'))) {
        console.log('\n2. Create missing PGMQ queues:')
        console.log('   Run: npx tsx scripts/create-github-queues.ts')
      }
      
      if (issues.some(i => i.includes('Cron job'))) {
        console.log('\n3. Create missing cron jobs:')
        console.log('   Run: npx tsx scripts/create-github-cron-jobs.ts')
      }
      
      if (issues.some(i => i.includes('RPC function'))) {
        console.log('\n4. Create missing RPC functions:')
        console.log('   Apply migration: 20250808_github_rpc_functions.sql')
      }
    } else {
      console.log('\n🎉 All components are properly deployed!')
    }

  } catch (error) {
    console.error('❌ Audit error:', error)
  }
}

// Run audit
auditGitHubAsyncSystem()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('💥 Error:', error)
    process.exit(1)
  })