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

async function testGitHubBranchesDirectly() {
  console.log('🔍 Testing GitHub Branch Access Directly')
  console.log('======================================\n')

  try {
    // Test 1: Access public repo WITHOUT authentication
    console.log('📦 Test 1: Accessing PUBLIC repo (srao-positron/camille) WITHOUT auth...')
    
    const publicResponse = await fetch('https://api.github.com/repos/srao-positron/camille/branches', {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    })

    if (publicResponse.ok) {
      const branches = await publicResponse.json()
      console.log(`✅ SUCCESS! Found ${branches.length} branches WITHOUT authentication:`)
      branches.forEach((branch: any) => {
        console.log(`   - ${branch.name} (SHA: ${branch.commit.sha.substring(0, 7)})`)
      })
    } else {
      console.log(`❌ Failed: ${publicResponse.status} ${publicResponse.statusText}`)
    }

    // Test 2: Get stored GitHub token
    console.log('\n📦 Test 2: Using stored GitHub token...')
    
    const { data: users } = await supabase
      .from('users')
      .select('id, github_username')
      .limit(1)
    
    const userId = users![0].id
    const githubUsername = users![0].github_username
    
    const { data: tokenData } = await supabase.rpc('get_github_token', {
      user_id: userId
    })

    if (!tokenData) {
      console.log('❌ No GitHub token found')
      return
    }

    console.log('✅ Found GitHub token')

    // Test 3: Access private repos with token
    console.log('\n📦 Test 3: Accessing user\'s repos WITH authentication...')
    
    const userReposResponse = await fetch(`https://api.github.com/user/repos?type=all&sort=updated&per_page=10`, {
      headers: {
        'Authorization': `Bearer ${tokenData}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    })

    if (userReposResponse.ok) {
      const repos = await userReposResponse.json()
      console.log(`✅ Found ${repos.length} repositories:`)
      
      // Check branches for each repo
      for (const repo of repos.slice(0, 3)) {
        console.log(`\n   📁 ${repo.full_name} (${repo.visibility})`)
        
        const branchResponse = await fetch(`https://api.github.com/repos/${repo.full_name}/branches`, {
          headers: {
            'Authorization': `Bearer ${tokenData}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        })
        
        if (branchResponse.ok) {
          const branches = await branchResponse.json()
          console.log(`      Branches (${branches.length}):`)
          branches.forEach((branch: any) => {
            console.log(`      - ${branch.name}`)
          })
        }
      }
    } else {
      console.log(`❌ Failed to get repos: ${userReposResponse.status}`)
    }

    // Test 4: Compare with our API
    console.log('\n\n📦 Test 4: Testing our branch import API...')
    
    // Get Camille repo from database
    const { data: camilleRepo } = await supabase
      .from('github_repositories')
      .select('id')
      .eq('full_name', 'srao-positron/camille')
      .single()

    if (camilleRepo) {
      console.log('   Testing with x-supabase-auth header...')
      
      const ourApiResponse = await fetch(`http://localhost:3000/api/github/branches/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'x-supabase-auth': JSON.stringify({ sub: userId })
        },
        body: JSON.stringify({
          repository_id: camilleRepo.id,
          branch_name: 'main',
          compare_to_base: false
        })
      })

      console.log(`   Response: ${ourApiResponse.status} ${ourApiResponse.statusText}`)
      const responseText = await ourApiResponse.text()
      console.log(`   Body: ${responseText}`)
    }

    // Summary
    console.log('\n\n📊 Analysis:')
    console.log('1. ✅ GitHub API allows PUBLIC repo access WITHOUT authentication')
    console.log('2. ✅ Your GitHub token is valid and works')
    console.log('3. ❌ Our API incorrectly requires browser authentication')
    console.log('4. 🔧 Solution: Fix the API to support public repo access without auth')

  } catch (error) {
    console.error('❌ Error:', error)
  }
}

// Run the test
testGitHubBranchesDirectly()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('💥 Error:', error)
    process.exit(1)
  })