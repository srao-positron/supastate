import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { createGitHubClient } from '@/lib/github/client'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { repository_id, branch_name, source = 'manual' } = body

    if (!repository_id || !branch_name) {
      return NextResponse.json(
        { error: 'repository_id and branch_name are required' },
        { status: 400 }
      )
    }

    // Get repository details
    const { data: repository, error: repoError } = await supabase
      .from('github_repositories')
      .select('*')
      .eq('id', repository_id)
      .single()

    if (repoError || !repository) {
      return NextResponse.json(
        { error: 'Repository not found' },
        { status: 404 }
      )
    }

    // Check user has access to this repository
    const { data: userAccess } = await supabase
      .from('github_user_repos')
      .select('*')
      .eq('repository_id', repository_id)
      .eq('user_id', user.id)
      .single()

    if (!userAccess) {
      return NextResponse.json(
        { error: 'You do not have access to this repository' },
        { status: 403 }
      )
    }

    // Get GitHub token
    const { data: tokenData } = await supabase.rpc('get_github_token', {
      user_id: user.id
    })

    if (!tokenData) {
      return NextResponse.json(
        { error: 'GitHub token not found. Please reconnect your GitHub account.' },
        { status: 400 }
      )
    }

    // Initialize GitHub client
    const githubClient = await createGitHubClient(tokenData)

    // Check if branch exists
    try {
      await githubClient.getBranch(repository.owner, repository.name, branch_name)
    } catch (error: any) {
      if (error.status === 404) {
        return NextResponse.json(
          { error: `Branch '${branch_name}' not found in repository` },
          { status: 404 }
        )
      }
      throw error
    }

    // Check if branch is already indexed
    const { data: existingBranch } = await supabase
      .from('github_indexed_branches')
      .select('*')
      .eq('repository_id', repository_id)
      .eq('branch_name', branch_name)
      .single()

    if (existingBranch && existingBranch.sync_status === 'synced') {
      return NextResponse.json(
        { 
          message: 'Branch is already indexed',
          branch: existingBranch 
        },
        { status: 200 }
      )
    }

    // Compare with base branch to get delta
    const baseBranch = repository.default_branch || 'main'
    let comparison = null
    let filesDifferent = 0

    if (branch_name !== baseBranch) {
      try {
        comparison = await githubClient.compareBranches(
          repository.owner,
          repository.name,
          baseBranch,
          branch_name
        )
        filesDifferent = comparison.files?.length || 0
      } catch (error) {
        console.warn(`[Branch Import] Could not compare branches: ${error}`)
      }
    }

    // Create or update branch record
    const { data: branch, error: branchError } = await supabase
      .from('github_indexed_branches')
      .upsert({
        repository_id,
        branch_name,
        base_branch: baseBranch,
        requested_by: user.id,
        source,
        files_different_from_base: filesDifferent,
        metadata: {
          ahead_by: comparison?.ahead_by || 0,
          behind_by: comparison?.behind_by || 0,
          total_commits: comparison?.total_commits || 0
        }
      }, {
        onConflict: 'repository_id,branch_name'
      })
      .select()
      .single()

    if (branchError) {
      console.error('[Branch Import] Error creating branch record:', branchError)
      return NextResponse.json(
        { error: 'Failed to create branch record' },
        { status: 500 }
      )
    }

    // Queue crawl job for the branch
    const { data: crawlJob, error: crawlError } = await supabase
      .from('github_crawl_queue')
      .insert({
        repository_id,
        crawl_type: 'branch',
        branch_name,
        crawl_scope: filesDifferent > 0 ? 'delta' : 'full',
        priority: 5,
        data: {
          branch_id: branch.id,
          files_to_crawl: comparison?.files?.map(f => f.filename) || [],
          github_token: tokenData
        }
      })
      .select()
      .single()

    if (crawlError) {
      console.error('[Branch Import] Error queuing crawl job:', crawlError)
      return NextResponse.json(
        { error: 'Failed to queue crawl job' },
        { status: 500 }
      )
    }

    // Update branch sync status
    await supabase
      .from('github_indexed_branches')
      .update({ sync_status: 'syncing' })
      .eq('id', branch.id)

    // Log activity
    await supabase.rpc('log_github_activity', {
      p_function_name: 'branch-import-api',
      p_level: 'info',
      p_message: `Branch import initiated for ${repository.full_name}#${branch_name}`,
      p_repository_id: repository_id,
      p_repository_full_name: repository.full_name,
      p_details: {
        branch_name,
        files_different: filesDifferent,
        crawl_job_id: crawlJob.id,
        source
      }
    })

    return NextResponse.json({
      success: true,
      branch,
      crawl_job: crawlJob,
      comparison: comparison ? {
        ahead_by: comparison.ahead_by,
        behind_by: comparison.behind_by,
        files_changed: comparison.files?.length || 0
      } : null
    })

  } catch (error: any) {
    console.error('[Branch Import API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}