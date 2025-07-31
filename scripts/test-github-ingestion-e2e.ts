#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function testGitHubIngestion() {
  console.log('Testing GitHub ingestion end-to-end...\n')

  try {
    // 1. Check if user has GitHub token
    console.log('1. Checking user GitHub token...')
    const { data: users } = await supabase
      .from('users')
      .select('id, email, github_username')
      .not('github_access_token_encrypted', 'is', null)
      .limit(1)
    
    if (!users || users.length === 0) {
      console.error('No users with GitHub tokens found. Please log in with GitHub first.')
      return
    }

    const user = users[0]
    console.log(`✓ Found user with GitHub token: ${user.email} (${user.github_username || 'unknown'})\n`)

    // 2. Add repository to database
    console.log('2. Adding Camille repository...')
    const repoFullName = 'srao-positron/camille'
    const [owner, name] = repoFullName.split('/')

    const { data: repo, error: repoError } = await supabase
      .from('github_repositories')
      .upsert({
        full_name: repoFullName,
        owner,
        name,
        github_id: 123456789, // Placeholder - will be updated during crawl
        html_url: `https://github.com/${repoFullName}`,
        clone_url: `https://github.com/${repoFullName}.git`,
        github_created_at: new Date().toISOString(),
        github_updated_at: new Date().toISOString()
      }, {
        onConflict: 'full_name',
        ignoreDuplicates: false
      })
      .select()
      .single()

    if (repoError) {
      console.error('Error creating repository:', repoError)
      return
    }
    console.log(`✓ Repository added: ${repo.id}\n`)

    // 3. Grant user access
    console.log('3. Granting user access...')
    const { error: accessError } = await supabase
      .from('github_user_repos')
      .upsert({
        user_id: user.id,
        repository_id: repo.id,
        role: 'owner'
      }, {
        onConflict: 'user_id,repository_id',
        ignoreDuplicates: false
      })

    if (accessError) {
      console.error('Error granting access:', accessError)
      return
    }
    console.log('✓ User access granted\n')

    // 4. Queue initial crawl (or get existing)
    console.log('4. Queueing initial crawl...')
    
    // First check if there's already a pending job
    let { data: existingJob } = await supabase
      .from('github_crawl_queue')
      .select()
      .eq('repository_id', repo.id)
      .eq('crawl_type', 'initial')
      .eq('status', 'pending')
      .single()
    
    let job
    if (existingJob) {
      console.log('✓ Using existing crawl job:', existingJob.id)
      job = existingJob
    } else {
      const { data: newJob, error: queueError } = await supabase
        .from('github_crawl_queue')
        .insert({
          repository_id: repo.id,
          crawl_type: 'initial',
          priority: 10,
          scheduled_for: new Date().toISOString()
        })
        .select()
        .single()

      if (queueError) {
        console.error('Error queueing crawl:', queueError)
        return
      }
      job = newJob
      console.log(`✓ New crawl job queued: ${job.id}`)
    }
    console.log()

    // 5. Process the queue
    console.log('5. Processing crawl queue...')
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const response = await fetch(`${appUrl}/api/github/process-queue`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('Error processing queue:', error)
      return
    }

    const result = await response.json()
    console.log('✓ Queue processed:', result)

    // 6. Check crawl status
    console.log('\n6. Checking crawl status...')
    const { data: updatedJob } = await supabase
      .from('github_crawl_queue')
      .select('status, error, completed_at')
      .eq('id', job.id)
      .single()

    console.log('Job status:', updatedJob?.status)
    if (updatedJob?.error) {
      console.error('Job error:', updatedJob.error)
    }

    // 7. Check ingestion logs
    console.log('\n7. Checking ingestion logs...')
    const { data: logs } = await supabase
      .from('github_ingestion_logs')
      .select('level, message, details')
      .eq('job_id', job.id)
      .order('timestamp', { ascending: false })
      .limit(10)

    console.log('\nRecent logs:')
    logs?.forEach(log => {
      const icon = log.level === 'error' ? '❌' : log.level === 'warning' ? '⚠️' : '✓'
      console.log(`${icon} [${log.level}] ${log.message}`)
      if (log.details && Object.keys(log.details).length > 0) {
        console.log('  Details:', JSON.stringify(log.details, null, 2))
      }
    })

    // 8. Test search
    console.log('\n8. Testing GitHub search...')
    const searchResponse = await fetch(`${appUrl}/api/github/search`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'x-supabase-auth': JSON.stringify({ user_id: user.id })
      },
      body: JSON.stringify({
        query: 'search',
        limit: 5
      })
    })

    if (!searchResponse.ok) {
      const error = await searchResponse.text()
      console.error('Search error:', error)
      return
    }

    const searchResults = await searchResponse.json()
    console.log('\nSearch results:')
    console.log(`Found ${searchResults.total} results from ${searchResults.repositories_searched} repositories`)
    
    searchResults.results?.slice(0, 3).forEach((result: any, i: number) => {
      console.log(`\n${i + 1}. [${result.type}] ${result.repository} (score: ${result.score.toFixed(3)})`)
      if (result.type === 'issue' || result.type === 'pull_request') {
        console.log(`   #${result.data.number}: ${result.data.title}`)
      } else if (result.type === 'commit') {
        console.log(`   ${result.data.sha.substring(0, 7)}: ${result.data.message.split('\n')[0]}`)
      } else if (result.type === 'code') {
        console.log(`   ${result.data.path} (${result.data.language})`)
      }
    })

    console.log('\n✅ GitHub ingestion test completed successfully!')

  } catch (error) {
    console.error('Test failed:', error)
  }
}

// Run the test
testGitHubIngestion()