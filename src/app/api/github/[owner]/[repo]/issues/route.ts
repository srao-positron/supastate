import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: { owner: string; repo: string } }
) {
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

    // Fetch issues from GitHub
    const { owner, repo } = params
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues?state=all&per_page=100`,
      {
        headers: {
          'Authorization': `Bearer ${tokenData}`,
          'Accept': 'application/vnd.github.v3+json',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error('GitHub API error:', response.status, errorText)
      
      if (response.status === 404) {
        return NextResponse.json(
          { error: `Repository ${owner}/${repo} not found or you don't have access` },
          { status: 404 }
        )
      }
      
      if (response.status === 401) {
        return NextResponse.json(
          { error: 'GitHub token is invalid or expired. Please re-authenticate.' },
          { status: 401 }
        )
      }
      
      return NextResponse.json(
        { error: 'Failed to fetch issues from GitHub' },
        { status: response.status }
      )
    }

    const issues = await response.json()
    
    // Return issue data
    return NextResponse.json({
      repository: `${owner}/${repo}`,
      count: issues.length,
      issues: issues.map((issue: any) => ({
        id: issue.id,
        number: issue.number,
        title: issue.title,
        state: issue.state,
        body: issue.body,
        user: {
          login: issue.user.login,
          avatar_url: issue.user.avatar_url
        },
        labels: issue.labels.map((label: any) => ({
          name: label.name,
          color: label.color
        })),
        assignees: issue.assignees.map((assignee: any) => assignee.login),
        created_at: issue.created_at,
        updated_at: issue.updated_at,
        closed_at: issue.closed_at,
        comments: issue.comments,
        html_url: issue.html_url,
        pull_request: !!issue.pull_request
      }))
    })

  } catch (error) {
    console.error('Error in GitHub issues API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}