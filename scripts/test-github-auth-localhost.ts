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

async function testGitHubAuth() {
  console.log('🔍 Testing GitHub Authentication')
  console.log('================================\n')

  try {
    // Get user
    const { data: users } = await supabase
      .from('users')
      .select('id, email, github_username, github_token_updated_at')
      .limit(1)
    
    if (!users || users.length === 0) {
      console.log('❌ No users found')
      return
    }

    const user = users[0]
    console.log(`User: ${user.email}`)
    console.log(`GitHub Username: ${user.github_username || 'Not set'}`)
    console.log(`Token Updated: ${user.github_token_updated_at || 'Never'}\n`)

    // Get GitHub token
    const { data: tokenData } = await supabase.rpc('get_github_token', {
      user_id: user.id
    })

    if (!tokenData) {
      console.log('❌ No GitHub token found')
      return
    }

    console.log(`✅ Found GitHub token (length: ${tokenData.length})`)

    // Test the token
    console.log('\n📡 Testing token with GitHub API...')
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${tokenData}`,
        'Accept': 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    })

    if (response.ok) {
      const githubUser = await response.json()
      console.log('✅ Token is valid!')
      console.log(`   GitHub User: ${githubUser.login}`)
      console.log(`   Name: ${githubUser.name || 'Not set'}`)
      console.log(`   Public Repos: ${githubUser.public_repos}`)
      console.log(`   Created: ${githubUser.created_at}`)

      // Check rate limit
      const rateLimit = response.headers.get('x-ratelimit-remaining')
      console.log(`\n📊 API Rate Limit: ${rateLimit} requests remaining`)

      // Test repository access
      console.log('\n🔍 Testing repository access...')
      const reposResponse = await fetch('https://api.github.com/user/repos?per_page=5&sort=updated', {
        headers: {
          'Authorization': `Bearer ${tokenData}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      })

      if (reposResponse.ok) {
        const repos = await reposResponse.json()
        console.log(`✅ Can access repositories (found ${repos.length} recent repos)`)
        repos.slice(0, 3).forEach((repo: any) => {
          console.log(`   - ${repo.full_name} (${repo.visibility})`)
        })
      }

      // Now test with our API using localhost:3000
      console.log('\n🌐 Testing with Supastate API (localhost:3000)...')
      
      // Create a mock Supabase auth token for testing
      const authHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'x-supabase-auth': JSON.stringify({ sub: user.id })
      }

      // Test GitHub repos endpoint
      const apiResponse = await fetch('http://localhost:3000/api/github/repos', {
        headers: authHeaders
      })

      if (apiResponse.ok) {
        const apiData = await apiResponse.json()
        console.log(`✅ API call succeeded!`)
        console.log(`   Total repositories: ${apiData.total}`)
        console.log(`   Has more: ${apiData.has_more}`)
      } else {
        console.log(`❌ API call failed: ${apiResponse.status} ${apiResponse.statusText}`)
        const error = await apiResponse.text()
        console.log(`   Error: ${error}`)
      }

    } else {
      console.log(`❌ Token is invalid: ${response.status} ${response.statusText}`)
      const error = await response.text()
      console.log(`   Error: ${error}`)
      
      // Check if it's a bad credentials error
      if (response.status === 401) {
        console.log('\n💡 Token appears to be expired or revoked.')
        console.log('   User needs to re-authenticate at: http://localhost:3000/auth/github')
      }
    }

  } catch (error) {
    console.error('❌ Error:', error)
  }
}

// Run the test
testGitHubAuth()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('💥 Error:', error)
    process.exit(1)
  })