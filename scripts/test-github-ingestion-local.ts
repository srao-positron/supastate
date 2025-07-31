import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function testGitHubIngestion() {
  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    console.log('Testing GitHub repository ingestion locally...\n')

    // Test repository - using the Camille repo
    const repoUrl = 'https://github.com/srao-positron/camille'
    const userId = 'a02c3fed-3a24-442f-becc-97bac8b75e90' // Your user ID

    console.log(`Ingesting repository: ${repoUrl}`)
    console.log(`User ID: ${userId}\n`)

    // First, ensure dev server is running
    console.log('Make sure your Next.js dev server is running (npm run dev)\n')

    // Call the ingest API
    const response = await fetch(`http://localhost:3000/api/github/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({
        repository_url: repoUrl,
        user_id: userId,
        force_refresh: true
      })
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('API Error:', error)
      return
    }

    const result = await response.json()
    console.log('Ingestion Response:', JSON.stringify(result, null, 2))

    if (result.repository_id) {
      // Check the queue status
      console.log('\nChecking crawl queue...')
      
      const { data: queueStatus } = await supabase
        .from('github_crawl_queue')
        .select('*')
        .eq('repository_id', result.repository_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      console.log('Queue Status:', {
        id: queueStatus?.id,
        status: queueStatus?.status,
        crawl_type: queueStatus?.crawl_type,
        priority: queueStatus?.priority,
        created_at: queueStatus?.created_at
      })

      // Check repository status
      console.log('\nChecking repository status...')
      
      const { data: repoStatus } = await supabase
        .from('github_repositories')
        .select('*')
        .eq('id', result.repository_id)
        .single()

      console.log('Repository:', {
        full_name: repoStatus?.full_name,
        crawl_status: repoStatus?.crawl_status,
        last_crawled_at: repoStatus?.last_crawled_at,
        github_id: repoStatus?.github_id
      })

      // Check ingestion logs
      console.log('\nChecking ingestion logs...')
      
      const { data: logs } = await supabase
        .from('github_ingestion_logs')
        .select('*')
        .eq('repository_id', result.repository_id)
        .order('timestamp', { ascending: false })
        .limit(10)

      if (logs && logs.length > 0) {
        console.log(`\nFound ${logs.length} log entries:`)
        logs.forEach((log, index) => {
          console.log(`\n${index + 1}. [${log.level.toUpperCase()}] ${log.message}`)
          console.log(`   Function: ${log.function_name}`)
          console.log(`   Time: ${new Date(log.timestamp).toLocaleString()}`)
          if (log.details && Object.keys(log.details).length > 0) {
            console.log(`   Details:`, log.details)
          }
        })
      } else {
        console.log('No logs found yet')
      }

      // Process the queue
      console.log('\n\nProcessing the queue...')
      
      const processResponse = await fetch(`http://localhost:3000/api/github/process-queue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`
        }
      })

      if (!processResponse.ok) {
        const error = await processResponse.json()
        console.error('Queue processing error:', error)
        return
      }

      const processResult = await processResponse.json()
      console.log('\nQueue processing result:', JSON.stringify(processResult, null, 2))

      // Check updated repository status
      await new Promise(resolve => setTimeout(resolve, 2000)) // Wait a bit
      
      console.log('\nChecking final repository status...')
      const { data: finalRepoStatus } = await supabase
        .from('github_repositories')
        .select('*')
        .eq('id', result.repository_id)
        .single()

      console.log('Final Repository Status:', {
        full_name: finalRepoStatus?.full_name,
        crawl_status: finalRepoStatus?.crawl_status,
        last_crawled_at: finalRepoStatus?.last_crawled_at,
        issues_count: finalRepoStatus?.open_issues_count
      })

      // Check final logs
      console.log('\nChecking final ingestion logs...')
      const { data: finalLogs } = await supabase
        .from('github_ingestion_logs')
        .select('*')
        .eq('repository_full_name', 'srao-positron/camille')
        .order('timestamp', { ascending: false })
        .limit(5)

      if (finalLogs && finalLogs.length > 0) {
        console.log(`\nLatest log entries after processing:`)
        finalLogs.forEach(log => {
          console.log(`[${log.level.toUpperCase()}] ${log.message} (${new Date(log.timestamp).toLocaleTimeString()})`)
        })
      }

      // Log a test entry
      console.log('\nLogging a test entry to github_ingestion_logs...')
      
      const { data: logEntry } = await supabase.rpc('log_github_activity', {
        p_function_name: 'test-script',
        p_level: 'info',
        p_message: 'Test ingestion initiated from local script',
        p_repository_id: result.repository_id,
        p_repository_full_name: 'srao-positron/camille',
        p_details: {
          test: true,
          timestamp: new Date().toISOString()
        }
      })

      console.log('✓ Test log entry created:', logEntry)
    }

  } catch (error) {
    console.error('Error:', error)
  }
}

testGitHubIngestion().catch(console.error)