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

async function importRealTestRepo() {
  console.log('🚀 Importing Real Test Repository')
  console.log('================================\n')

  try {
    // Get user with GitHub token
    const { data: users } = await supabase
      .from('users')
      .select('id, email, github_username')
      .limit(1)
    
    if (!users || users.length === 0) {
      throw new Error('No users found')
    }
    
    const userId = users[0].id
    console.log(`User: ${users[0].email}`)
    console.log(`GitHub Username: ${users[0].github_username}\n`)

    // Get GitHub token
    const { data: tokenData } = await supabase.rpc('get_github_token', {
      user_id: userId
    })

    if (!tokenData) {
      throw new Error('No GitHub token found')
    }

    console.log('✅ Found valid GitHub token\n')

    // Option 1: Import one of your existing repositories
    console.log('📦 Available options for test repositories:')
    console.log('1. srao-positron/hawking-edison - Your public repo')
    console.log('2. microsoft/TypeScript-Node-Starter - Small TypeScript template')
    console.log('3. sindresorhus/type-fest - Popular TypeScript type utilities')
    console.log('\nImporting microsoft/TypeScript-Node-Starter for testing...\n')

    const testRepo = {
      owner: 'microsoft',
      name: 'TypeScript-Node-Starter'
    }

    // Step 1: Fork the repository
    console.log(`🍴 Attempting to fork ${testRepo.owner}/${testRepo.name}...`)
    
    const forkResponse = await fetch(`https://api.github.com/repos/${testRepo.owner}/${testRepo.name}/forks`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenData}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    })

    let repoToImport = testRepo

    if (forkResponse.ok) {
      const fork = await forkResponse.json()
      console.log(`✅ Successfully forked to: ${fork.full_name}`)
      repoToImport = {
        owner: fork.owner.login,
        name: fork.name
      }
      // Wait for fork to be ready
      await new Promise(resolve => setTimeout(resolve, 3000))
    } else if (forkResponse.status === 422) {
      // Already forked
      console.log('ℹ️  Repository already forked, checking for existing fork...')
      
      const userReposResponse = await fetch(`https://api.github.com/users/${users[0].github_username}/repos?type=forks`, {
        headers: {
          'Authorization': `Bearer ${tokenData}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      })
      
      if (userReposResponse.ok) {
        const repos = await userReposResponse.json()
        const existingFork = repos.find((r: any) => r.name === testRepo.name)
        if (existingFork) {
          console.log(`✅ Found existing fork: ${existingFork.full_name}`)
          repoToImport = {
            owner: existingFork.owner.login,
            name: existingFork.name
          }
        }
      }
    } else {
      console.log('⚠️  Could not fork repository, importing original instead')
    }

    // Step 2: Import the repository
    console.log(`\n📥 Importing repository: ${repoToImport.owner}/${repoToImport.name}`)
    
    const importPayload = {
      repository_url: `https://github.com/${repoToImport.owner}/${repoToImport.name}`,
      user_id: userId,
      force_refresh: false
    }
    
    console.log('Request payload:', importPayload)
    
    const importResponse = await fetch(`http://localhost:3000/api/github/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'x-supabase-auth': JSON.stringify({ sub: userId })
      },
      body: JSON.stringify(importPayload)
    })

    if (!importResponse.ok) {
      const error = await importResponse.text()
      throw new Error(`Import failed: ${error}`)
    }

    const result = await importResponse.json()
    console.log('\n✅ Repository imported successfully!')
    console.log('Result:', JSON.stringify(result, null, 2))

    // Step 3: Check the import status
    if (result.repository?.id) {
      console.log('\n📊 Repository Details:')
      console.log(`ID: ${result.repository.id}`)
      console.log(`Full Name: ${result.repository.full_name}`)
      console.log(`Language: ${result.repository.language}`)
      console.log(`Default Branch: ${result.repository.default_branch}`)
      
      // Check crawl queue
      const { data: crawlJobs } = await supabase
        .from('github_crawl_queue')
        .select('*')
        .eq('repository_id', result.repository.id)
        .order('created_at', { ascending: false })
        .limit(5)

      console.log(`\n📋 Crawl Queue (${crawlJobs?.length || 0} jobs):`)
      crawlJobs?.forEach(job => {
        console.log(`- ${job.crawl_type} crawl: ${job.status} (Priority: ${job.priority})`)
      })
    }

    console.log('\n🎯 Next Steps:')
    console.log('1. Monitor the crawl queue for progress')
    console.log('2. Check Neo4j for imported code entities')
    console.log('3. Test branch detection and imports')
    console.log('4. Try the GitHub search API')
    console.log('\n✨ You now have a real TypeScript repository to test with!')

  } catch (error) {
    console.error('❌ Error:', error)
  }
}

// Run the import
importRealTestRepo()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('💥 Error:', error)
    process.exit(1)
  })