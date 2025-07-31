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

async function testGitHubAsyncE2E() {
  console.log('🧪 GitHub Async System End-to-End Test')
  console.log('======================================\n')

  try {
    // 1. Get a user for testing
    const { data: users } = await supabase
      .from('users')
      .select('id')
      .limit(1)
    
    if (!users || users.length === 0) {
      console.log('❌ No users found for testing')
      return
    }
    
    const userId = users[0].id
    console.log(`Using user: ${userId}\n`)

    // 2. Import a test repository via API
    console.log('📥 Step 1: Importing test repository...')
    
    const testRepo = 'https://github.com/vercel/swr' // A medium-sized TypeScript repo
    
    const importResponse = await fetch('http://localhost:3000/api/github/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({
        repository_url: testRepo,
        user_id: userId,
        force_refresh: true
      })
    })

    if (!importResponse.ok) {
      const error = await importResponse.json()
      console.log('❌ Import failed:', error)
      return
    }

    const importResult = await importResponse.json()
    console.log('✅ Import successful:', importResult)
    
    const repositoryId = importResult.repository_id
    const queueId = importResult.queue_id

    // 3. Check queue status
    console.log('\n📊 Step 2: Checking queue status...')
    
    const { data: queueItem } = await supabase
      .from('github_crawl_queue')
      .select('*')
      .eq('id', queueId)
      .single()
    
    console.log('Queue item:', {
      id: queueItem.id,
      status: queueItem.status,
      crawl_type: queueItem.crawl_type,
      priority: queueItem.priority
    })

    // 4. Manually trigger coordinator (to test without waiting for cron)
    console.log('\n🚀 Step 3: Triggering coordinator manually...')
    
    const coordResponse = await supabase.functions.invoke('github-crawl-coordinator')
    console.log('Coordinator response:', coordResponse.data)

    // 5. Wait and check progress
    console.log('\n⏳ Step 4: Waiting for processing (15 seconds)...')
    await new Promise(resolve => setTimeout(resolve, 15000))

    // 6. Check queue status again
    const { data: updatedQueue } = await supabase
      .from('github_crawl_queue')
      .select('*')
      .eq('id', queueId)
      .single()
    
    console.log('\nUpdated queue status:', updatedQueue.status)
    
    if (updatedQueue.status === 'processing') {
      console.log('✅ Job is being processed!')
    } else if (updatedQueue.status === 'completed') {
      console.log('✅ Job completed!')
    } else if (updatedQueue.status === 'failed') {
      console.log('❌ Job failed:', updatedQueue.error)
    }

    // 7. Check ingestion logs
    console.log('\n📋 Step 5: Checking ingestion logs...')
    
    const { data: logs } = await supabase
      .from('github_ingestion_logs')
      .select('*')
      .eq('repository_id', repositoryId)
      .order('created_at', { ascending: false })
      .limit(10)
    
    console.log(`\nFound ${logs?.length || 0} log entries:`)
    logs?.forEach(log => {
      console.log(`[${log.level}] ${log.function_name}: ${log.message}`)
    })

    // 8. Check if files were queued for parsing
    console.log('\n📦 Step 6: Checking code parsing queue...')
    
    // Since we can't directly query PGMQ, let's check if any files were created
    const { data: codeEntities, count } = await supabase
      .from('code_entities')
      .select('*', { count: 'exact', head: false })
      .eq('project_id', repositoryId)
      .limit(5)
    
    console.log(`\nCode entities created: ${count || 0}`)
    if (codeEntities && codeEntities.length > 0) {
      codeEntities.forEach(entity => {
        console.log(`- ${entity.file_path} (${entity.type})`)
      })
    }

    // 9. Check repository status
    console.log('\n🏁 Step 7: Final repository status...')
    
    const { data: finalRepo } = await supabase
      .from('github_repositories')
      .select('*')
      .eq('id', repositoryId)
      .single()
    
    console.log({
      crawl_status: finalRepo.crawl_status,
      last_crawled_at: finalRepo.last_crawled_at,
      files_count: finalRepo.files_count,
      branches_count: finalRepo.branches_count
    })

    // Summary
    console.log('\n\n📊 TEST SUMMARY')
    console.log('===============\n')
    
    const issues = []
    const successes = []
    
    if (importResult.success) successes.push('Repository imported successfully')
    if (updatedQueue.status !== 'pending') successes.push('Job was picked up by coordinator')
    if (logs && logs.length > 0) successes.push('Logging is working')
    if (count && count > 0) successes.push('Code parsing is working')
    
    if (updatedQueue.status === 'failed') issues.push('Job failed: ' + updatedQueue.error)
    if (updatedQueue.status === 'pending') issues.push('Job not processed - coordinator might not be running')
    if (!logs || logs.length === 0) issues.push('No logs generated')
    if (!count || count === 0) issues.push('No code entities created')
    
    console.log(`✅ Successes (${successes.length})`)
    successes.forEach(s => console.log(`   - ${s}`))
    
    if (issues.length > 0) {
      console.log(`\n❌ Issues (${issues.length})`)
      issues.forEach(i => console.log(`   - ${i}`))
    }
    
    console.log('\n🎯 Overall Result:', issues.length === 0 ? '✅ PASSED' : '❌ FAILED')

  } catch (error) {
    console.error('❌ Test error:', error)
  }
}

// Run test
testGitHubAsyncE2E()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('💥 Error:', error)
    process.exit(1)
  })