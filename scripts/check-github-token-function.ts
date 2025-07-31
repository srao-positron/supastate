import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkGitHubTokenFunction() {
  console.log('Checking GitHub token functions...\n')

  try {
    // Test if the function exists by calling it with dummy data
    console.log('Testing store_github_token function...')
    const { data, error } = await supabase.rpc('store_github_token', {
      user_id: 'a02c3fed-3a24-442f-becc-97bac8b75e90', // Your user ID
      token: 'test_token_' + Date.now(),
      scopes: ['repo', 'read:user'],
      username: 'test_user'
    })

    if (error) {
      console.error('Error calling store_github_token:', error)
      console.error('Error details:', error.message)
      console.error('Error hint:', (error as any).hint)
    } else {
      console.log('store_github_token function works!')
      console.log('Response:', data)
      
      // Now check if it was stored
      const { data: user } = await supabase
        .from('users')
        .select('github_username, github_token_updated_at, github_access_token_encrypted')
        .eq('id', 'a02c3fed-3a24-442f-becc-97bac8b75e90')
        .single()
        
      console.log('\nUser data after storing:')
      console.log('  GitHub Username:', user?.github_username)
      console.log('  Token Updated:', user?.github_token_updated_at)
      console.log('  Has encrypted token:', !!user?.github_access_token_encrypted)
    }

  } catch (error) {
    console.error('Unexpected error:', error)
  }
}

checkGitHubTokenFunction()