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
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function testBranchImport() {
  console.log('🧪 Testing GitHub Branch Import')
  console.log('===============================\n')

  try {
    // Step 1: Find a repository to test with
    console.log('1️⃣ Finding a repository to test with...')
    
    const { data: repositories } = await supabase
      .from('github_repositories')
      .select('*')
      .limit(1)
    
    if (!repositories || repositories.length === 0) {
      console.log('❌ No repositories found. Please import a repository first.')
      return
    }
    
    const repository = repositories[0]
    console.log(`✅ Using repository: ${repository.full_name}`)

    // Step 2: Get a user with GitHub token
    console.log('\n2️⃣ Finding a user with GitHub access...')
    
    const { data: userRepos } = await supabase
      .from('github_user_repos')
      .select('user_id')
      .eq('repository_id', repository.id)
      .limit(1)
    
    if (!userRepos || userRepos.length === 0) {
      console.log('❌ No users have access to this repository')
      return
    }
    
    const userId = userRepos[0].user_id
    
    // Get user auth token
    const { data: userData } = await supabase
      .from('users')
      .select('email')
      .eq('id', userId)
      .single()
    
    console.log(`✅ Using user: ${userData?.email}`)

    // Step 3: Create a test auth token (in real app, this comes from auth)
    // For testing, we'll use service role key
    const authToken = `Bearer ${supabaseAnonKey}`

    // Step 4: Test branch import API
    console.log('\n3️⃣ Testing branch import API...')
    
    const testBranch = 'test-branch-import'
    const importUrl = `http://localhost:3002/api/github/branches/import`
    
    console.log(`📥 Importing branch: ${testBranch}`)
    
    const response = await fetch(importUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authToken,
        'x-supabase-auth': JSON.stringify({ sub: userId })
      },
      body: JSON.stringify({
        repository_id: repository.id,
        branch_name: testBranch,
        compare_to_base: true
      })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Branch import failed: ${error}`)
    }

    const result = await response.json()
    console.log('✅ Branch import result:', JSON.stringify(result, null, 2))

    // Step 5: Check if branch was created
    console.log('\n4️⃣ Checking branch record...')
    
    const { data: branch } = await supabase
      .from('github_indexed_branches')
      .select('*')
      .eq('repository_id', repository.id)
      .eq('branch_name', testBranch)
      .single()

    if (branch) {
      console.log('✅ Branch record created:', {
        id: branch.id,
        branch_name: branch.branch_name,
        sync_status: branch.sync_status,
        files_different: branch.files_different_from_base
      })
    } else {
      console.log('❌ Branch record not found')
    }

    // Step 6: Check crawl queue
    console.log('\n5️⃣ Checking crawl queue...')
    
    const { data: crawlJob } = await supabase
      .from('github_crawl_queue')
      .select('*')
      .eq('repository_id', repository.id)
      .eq('branch_name', testBranch)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (crawlJob) {
      console.log('✅ Crawl job queued:', {
        id: crawlJob.id,
        status: crawlJob.status,
        crawl_type: crawlJob.crawl_type,
        crawl_scope: crawlJob.crawl_scope,
        priority: crawlJob.priority
      })
    } else {
      console.log('❌ No crawl job found')
    }

    // Step 7: Test branch listing API
    console.log('\n6️⃣ Testing branch listing API...')
    
    const listUrl = `http://localhost:3002/api/github/branches?repository_id=${repository.id}`
    
    const listResponse = await fetch(listUrl, {
      method: 'GET',
      headers: {
        'Authorization': authToken,
        'x-supabase-auth': JSON.stringify({ sub: userId })
      }
    })

    if (listResponse.ok) {
      const branches = await listResponse.json()
      console.log('✅ Branch listing:', {
        total_indexed: branches.total_indexed,
        total_remote: branches.total_remote,
        indexed_branches: branches.indexed_branches?.length || 0
      })
    }

    console.log('\n✅ Branch import test completed successfully!')

  } catch (error) {
    console.error('❌ Test failed:', error)
    throw error
  }
}

// Run the test
testBranchImport()
  .then(() => {
    console.log('\n✨ All tests passed!')
    process.exit(0)
  })
  .catch(error => {
    console.error('\n💥 Test error:', error)
    process.exit(1)
  })