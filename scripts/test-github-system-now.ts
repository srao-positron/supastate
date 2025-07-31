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

async function testGitHubSystemNow() {
  console.log('🧪 Testing GitHub System Now')
  console.log('===========================\n')

  try {
    // 1. Test with a simple public repository
    console.log('📥 Step 1: Testing with simple public repo...')
    
    // Create a test repository entry directly
    const { data: repo, error: repoError } = await supabase
      .from('github_repositories')
      .insert({
        github_id: 1234567890,
        owner: 'vercel',
        name: 'swr',
        full_name: 'vercel/swr',
        private: false,
        description: 'React Hooks for Data Fetching',
        default_branch: 'main',
        html_url: 'https://github.com/vercel/swr',
        language: 'TypeScript'
      })
      .select()
      .single()
    
    if (repoError) {
      console.log('Repository might already exist:', repoError.message)
      // Try to get existing
      const { data: existingRepo } = await supabase
        .from('github_repositories')
        .select('*')
        .eq('full_name', 'vercel/swr')
        .single()
      
      if (existingRepo) {
        console.log('✅ Using existing repository:', existingRepo.full_name)
        
        // Queue a crawl job
        const { data: jobId, error: queueError } = await supabase.rpc('queue_github_crawl', {
          p_repository_id: existingRepo.id,
          p_crawl_type: 'manual',
          p_priority: 50,
          p_data: { test: true, public_repo: true }
        })
        
        if (queueError) {
          console.log('❌ Failed to queue job:', queueError)
        } else {
          console.log('✅ Queued job:', jobId)
          
          // Check queue
          const { data: queueItem } = await supabase
            .from('github_crawl_queue')
            .select('*')
            .eq('id', jobId)
            .single()
          
          console.log('\nQueue item:', {
            id: queueItem.id,
            status: queueItem.status,
            priority: queueItem.priority
          })
          
          // Manually trigger coordinator
          console.log('\n🚀 Step 2: Triggering coordinator...')
          
          const coordResponse = await supabase.functions.invoke('github-crawl-coordinator')
          console.log('Coordinator response:', coordResponse.data)
          
          // Wait a bit
          console.log('\n⏳ Waiting 5 seconds...')
          await new Promise(resolve => setTimeout(resolve, 5000))
          
          // Check status
          const { data: updatedItem } = await supabase
            .from('github_crawl_queue')
            .select('*')
            .eq('id', jobId)
            .single()
          
          console.log('\n📊 Updated status:', updatedItem.status)
          if (updatedItem.error) {
            console.log('Error:', updatedItem.error)
          }
          
          // Check logs
          const { data: logs } = await supabase
            .from('github_ingestion_logs')
            .select('level, function_name, message')
            .eq('repository_id', existingRepo.id)
            .order('created_at', { ascending: false })
            .limit(10)
          
          console.log('\n📋 Recent logs:')
          logs?.forEach(log => {
            console.log(`[${log.level}] ${log.function_name}: ${log.message}`)
          })
        }
      }
    } else {
      console.log('✅ Created new repository:', repo.full_name)
    }
    
    // Check PGMQ metrics
    console.log('\n📊 Queue Metrics:')
    
    const queues = ['github_crawl', 'github_code_parsing']
    for (const queueName of queues) {
      const { data: metrics } = await supabase.rpc('pgmq_metrics', {
        queue_name: queueName
      })
      
      if (metrics) {
        console.log(`${queueName}: length=${metrics.queue_length}, total=${metrics.total_messages}`)
      }
    }

  } catch (error) {
    console.error('❌ Test error:', error)
  }
}

// Run test
testGitHubSystemNow()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('💥 Error:', error)
    process.exit(1)
  })