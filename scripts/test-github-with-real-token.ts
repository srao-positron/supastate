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

async function testGitHubWithRealToken() {
  console.log('🧪 Testing GitHub Ingest with Real Token')
  console.log('========================================\n')

  try {
    // Your user ID that has a GitHub token
    const userId = 'a02c3fed-3a24-442f-becc-97bac8b75e90'
    
    // Test repository
    const repoUrl = 'https://github.com/vercel/swr'
    
    console.log(`User: ${userId}`)
    console.log(`Repository: ${repoUrl}\n`)
    
    // Call the GitHub ingest API
    console.log('📥 Calling GitHub ingest API...')
    
    const response = await fetch('http://localhost:3000/api/github/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({
        repository_url: repoUrl,
        user_id: userId,
        force_refresh: true
      })
    })
    
    console.log(`Response status: ${response.status}`)
    
    const result = await response.json()
    console.log('Response:', JSON.stringify(result, null, 2))
    
    if (result.success && result.queue_id) {
      // Wait a moment for coordinator to pick it up
      console.log('\n⏳ Waiting 3 seconds for coordinator...')
      await new Promise(resolve => setTimeout(resolve, 3000))
      
      // Check job status
      const { data: job } = await supabase
        .from('github_crawl_queue')
        .select('*')
        .eq('id', result.queue_id)
        .single()
      
      console.log('\n📊 Job Status:')
      console.log(`- Status: ${job.status}`)
      console.log(`- Type: ${job.crawl_type}`)
      console.log(`- Priority: ${job.priority}`)
      console.log(`- Created: ${new Date(job.created_at).toLocaleString()}`)
      
      if (job.started_at) {
        console.log(`- Started: ${new Date(job.started_at).toLocaleString()}`)
      }
      
      if (job.error) {
        console.log(`- Error: ${job.error}`)
      }
      
      // Check recent logs
      const { data: logs } = await supabase
        .from('github_ingestion_logs')
        .select('level, function_name, message, created_at')
        .eq('repository_id', result.repository_id)
        .order('created_at', { ascending: false })
        .limit(10)
      
      if (logs && logs.length > 0) {
        console.log('\n📋 Recent Logs:')
        logs.forEach(log => {
          const time = new Date(log.created_at).toLocaleTimeString()
          console.log(`[${time}] ${log.level}: ${log.function_name} - ${log.message}`)
        })
      }
      
      // Check if repository was updated
      const { data: repo } = await supabase
        .from('github_repositories')
        .select('*')
        .eq('id', result.repository_id)
        .single()
      
      console.log('\n📂 Repository Status:')
      console.log(`- Name: ${repo.full_name}`)
      console.log(`- Crawl Status: ${repo.crawl_status}`)
      console.log(`- Files Count: ${repo.files_count || 0}`)
      console.log(`- Branches Count: ${repo.branches_count || 0}`)
      console.log(`- Last Crawled: ${repo.last_crawled_at ? new Date(repo.last_crawled_at).toLocaleString() : 'Never'}`)
    }
    
  } catch (error) {
    console.error('❌ Test error:', error)
  }
}

// Run test
testGitHubWithRealToken()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('💥 Error:', error)
    process.exit(1)
  })