import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function testGitHubIngestion() {
  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    console.log('Testing GitHub repository ingestion...\n')

    // Test repository URL
    const repoUrl = 'https://github.com/srao-positron/camille'
    const userId = 'a02c3fed-3a24-442f-becc-97bac8b75e90' // Your user ID

    console.log(`Ingesting repository: ${repoUrl}`)
    console.log(`User ID: ${userId}\n`)

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

      console.log('Queue Status:', queueStatus)

      // Check repository status
      console.log('\nChecking repository status...')
      
      const { data: repoStatus } = await supabase
        .from('github_repositories')
        .select('*')
        .eq('id', result.repository_id)
        .single()

      console.log('Repository:', {
        full_name: repoStatus.full_name,
        crawl_status: repoStatus.crawl_status,
        last_crawled_at: repoStatus.last_crawled_at
      })

      // Manually trigger the coordinator
      console.log('\nTriggering crawl coordinator...')
      
      const coordResponse = await supabase.functions.invoke('github-crawl-coordinator')
      console.log('Coordinator Response:', coordResponse.data)
    }

  } catch (error) {
    console.error('Error:', error)
  }
}

testGitHubIngestion().catch(console.error)