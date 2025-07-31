import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

async function testGitHubToken() {
  console.log('Testing GitHub token for Camille repo...\n')

  try {
    // Get your GitHub token
    const { data: token, error: tokenError } = await supabase.rpc('get_github_token', {
      user_id: 'a02c3fed-3a24-442f-becc-97bac8b75e90'
    })

    if (tokenError) {
      console.error('Error getting token:', tokenError)
      return
    }

    if (!token) {
      console.error('No token found')
      return
    }

    console.log('Token retrieved successfully!')
    console.log('Token starts with:', token.substring(0, 10) + '...')
    
    // Test the token by fetching Camille issues
    console.log('\nFetching issues from srao-positron/camille...')
    
    const response = await fetch(
      'https://api.github.com/repos/srao-positron/camille/issues?state=all&per_page=10',
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      }
    )

    console.log('GitHub API Response:', response.status, response.statusText)

    if (!response.ok) {
      const error = await response.text()
      console.error('Error response:', error)
      return
    }

    const issues = await response.json()
    console.log(`\nFound ${issues.length} issues:`)
    
    issues.forEach((issue: any) => {
      console.log(`\n#${issue.number}: ${issue.title}`)
      console.log(`  State: ${issue.state}`)
      console.log(`  Created by: ${issue.user.login}`)
      console.log(`  URL: ${issue.html_url}`)
    })

  } catch (error) {
    console.error('Unexpected error:', error)
  }
}

testGitHubToken()