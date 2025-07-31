import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

async function testGitHubTokenStorage() {
  console.log('Testing GitHub token storage...\n')

  try {
    // Get a test user (you'll need to replace this with a real user ID)
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, github_username, github_token_scopes, github_token_updated_at')
      .limit(5)

    if (usersError) {
      console.error('Error fetching users:', usersError)
      return
    }

    console.log(`Found ${users.length} users`)
    
    for (const user of users) {
      console.log(`\nUser: ${user.email}`)
      console.log(`  ID: ${user.id}`)
      console.log(`  GitHub Username: ${user.github_username || 'Not set'}`)
      console.log(`  Token Scopes: ${user.github_token_scopes ? user.github_token_scopes.join(', ') : 'Not set'}`)
      console.log(`  Token Updated: ${user.github_token_updated_at || 'Never'}`)
      
      // Check if they have a token (without retrieving it)
      const { data: tokenCheck } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .not('github_access_token_encrypted', 'is', null)
        .single()
      
      console.log(`  Has Token: ${tokenCheck ? 'Yes' : 'No'}`)
    }

    // Test storing a token (commented out to prevent accidental execution)
    /*
    const testUserId = 'YOUR_USER_ID_HERE'
    const testToken = 'ghp_test_token_12345'
    const testScopes = ['repo', 'read:user']
    const testUsername = 'testuser'

    console.log('\n\nTesting token storage...')
    const { error: storeError } = await supabase.rpc('store_github_token', {
      user_id: testUserId,
      token: testToken,
      scopes: testScopes,
      username: testUsername
    })

    if (storeError) {
      console.error('Error storing token:', storeError)
    } else {
      console.log('Token stored successfully!')
      
      // Test retrieving the token
      const { data: retrievedToken, error: retrieveError } = await supabase.rpc('get_github_token', {
        user_id: testUserId
      })

      if (retrieveError) {
        console.error('Error retrieving token:', retrieveError)
      } else {
        console.log('Token retrieved successfully!')
        console.log('Token matches:', retrievedToken === testToken)
      }
    }
    */

  } catch (error) {
    console.error('Unexpected error:', error)
  }
}

testGitHubTokenStorage()