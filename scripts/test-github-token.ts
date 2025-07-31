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

async function testGitHubToken() {
  console.log('🔍 Testing GitHub Token Access')
  console.log('==============================\n')

  try {
    // Check if we have GitHub user tokens table
    const { data: tokens, error: tokenError } = await supabase
      .from('github_user_tokens')
      .select('user_id, created_at')
      .limit(5)
    
    if (tokenError) {
      console.log('❌ github_user_tokens table error:', tokenError.message)
    } else {
      console.log(`Found ${tokens?.length || 0} GitHub tokens`)
    }
    
    // Check users table for GitHub auth
    const { data: users } = await supabase
      .from('users')
      .select('id, email, raw_app_meta_data')
      .limit(1)
    
    if (users && users.length > 0) {
      const user = users[0]
      console.log('\nUser:', user.email)
      console.log('Has GitHub in metadata:', user.raw_app_meta_data?.provider === 'github')
      
      // Try to get GitHub token via RPC
      const { data: token, error: rpcError } = await supabase.rpc('get_github_token', {
        user_id: user.id
      })
      
      if (rpcError) {
        console.log('\nget_github_token RPC error:', rpcError.message)
        
        // Check if the function exists
        if (rpcError.message.includes('does not exist')) {
          console.log('\n❌ get_github_token function does not exist!')
          console.log('This function needs to be created to retrieve GitHub tokens')
        }
      } else {
        console.log('\n✅ GitHub token retrieved:', token ? 'Yes' : 'No')
      }
    }
    
    // Test with a public repository that doesn't need auth
    console.log('\n🧪 Testing with public repository (no auth needed)...')
    
    const testRepo = 'https://github.com/vercel/next.js'
    const response = await fetch(`${supabaseUrl}/functions/v1/github-crawl-worker`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        test_mode: true,
        repository: {
          full_name: 'vercel/next.js',
          owner: 'vercel',
          name: 'next.js',
          private: false
        }
      })
    })
    
    console.log('Worker test response:', response.status, response.statusText)
    if (!response.ok) {
      const error = await response.text()
      console.log('Error:', error)
    }
    
  } catch (error) {
    console.error('❌ Error:', error)
  }
}

// Run test
testGitHubToken()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('💥 Error:', error)
    process.exit(1)
  })