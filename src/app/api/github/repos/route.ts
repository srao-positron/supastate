import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Retrieve GitHub token
    const { data: tokenData, error: tokenError } = await supabase.rpc('get_github_token', {
      user_id: user.id
    })

    if (tokenError) {
      console.error('Error retrieving GitHub token:', tokenError)
      return NextResponse.json(
        { error: 'Failed to retrieve GitHub token' },
        { status: 500 }
      )
    }

    if (!tokenData) {
      return NextResponse.json(
        { error: 'No GitHub token found. Please re-authenticate.' },
        { status: 404 }
      )
    }

    // Make a request to GitHub API
    const response = await fetch('https://api.github.com/user/repos', {
      headers: {
        'Authorization': `Bearer ${tokenData}`,
        'Accept': 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('GitHub API error:', response.status, errorText)
      
      if (response.status === 401) {
        return NextResponse.json(
          { error: 'GitHub token is invalid or expired. Please re-authenticate.' },
          { status: 401 }
        )
      }
      
      return NextResponse.json(
        { error: 'Failed to fetch repositories from GitHub' },
        { status: response.status }
      )
    }

    const repos = await response.json()
    
    // Return repository data
    return NextResponse.json({
      count: repos.length,
      repositories: repos.map((repo: any) => ({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        description: repo.description,
        private: repo.private,
        html_url: repo.html_url,
        language: repo.language,
        stargazers_count: repo.stargazers_count,
        updated_at: repo.updated_at,
        default_branch: repo.default_branch,
        has_issues: repo.has_issues,
        open_issues_count: repo.open_issues_count
      }))
    })

  } catch (error) {
    console.error('Error in GitHub repos API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}