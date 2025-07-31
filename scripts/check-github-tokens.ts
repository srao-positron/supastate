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

async function checkGitHubTokens() {
  console.log('🔍 Checking GitHub Tokens')
  console.log('========================\n')

  try {
    // Get all users
    const { data: users, error } = await supabase
      .from('users')
      .select('id, email, github_username, github_token_updated_at')
    
    if (error) {
      throw error
    }

    console.log(`Found ${users?.length || 0} users\n`)

    if (!users || users.length === 0) {
      console.log('❌ No users found in the database')
      return
    }

    // Check each user for GitHub token
    for (const user of users) {
      console.log(`User: ${user.email}`)
      console.log(`  ID: ${user.id}`)
      console.log(`  GitHub Username: ${user.github_username || 'Not set'}`)
      console.log(`  Token Updated: ${user.github_token_updated_at || 'Never'}`)

      // Try to get token (will be null if not set)
      const { data: tokenData } = await supabase.rpc('get_github_token', {
        user_id: user.id
      })

      if (tokenData) {
        console.log(`  ✅ Has GitHub token (length: ${tokenData.length})`)
        
        // Test the token
        try {
          const response = await fetch('https://api.github.com/user', {
            headers: {
              'Authorization': `Bearer ${tokenData}`,
              'Accept': 'application/vnd.github.v3+json'
            }
          })

          if (response.ok) {
            const githubUser = await response.json()
            console.log(`  ✅ Token is valid - GitHub user: ${githubUser.login}`)
          } else {
            console.log(`  ❌ Token is invalid: ${response.status} ${response.statusText}`)
          }
        } catch (error) {
          console.log(`  ❌ Error testing token: ${error}`)
        }
      } else {
        console.log(`  ❌ No GitHub token found`)
      }
      
      console.log('')
    }

    // Check auth.identities for GitHub connections
    console.log('\n📊 Checking GitHub OAuth connections...')
    
    const { data: identities, error: identError } = await supabase
      .from('identities')
      .select('*')
      .eq('provider', 'github')
    
    if (identities && identities.length > 0) {
      console.log(`\nFound ${identities.length} GitHub OAuth connections:`)
      
      for (const identity of identities) {
        const userData = identity.identity_data as any
        console.log(`\nUser ID: ${identity.user_id}`)
        console.log(`  GitHub Username: ${userData?.user_name || userData?.preferred_username || 'Unknown'}`)
        console.log(`  Created: ${identity.created_at}`)
        console.log(`  Last Sign In: ${identity.last_sign_in_at}`)
      }
    } else {
      console.log('❌ No GitHub OAuth connections found')
    }

    console.log('\n💡 To connect GitHub:')
    console.log('1. User needs to sign in with GitHub OAuth')
    console.log('2. Or manually set a GitHub personal access token')
    console.log('3. Visit: http://localhost:3002/auth/github to connect')

  } catch (error) {
    console.error('❌ Error:', error)
  }
}

// Run the check
checkGitHubTokens()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('💥 Error:', error)
    process.exit(1)
  })