import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NextRequest, NextResponse } from 'next/server'
import { createGitHubClient } from '@/lib/github/client'
import { Octokit } from '@octokit/rest'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { repository_id, branch_name, source = 'manual', compare_to_base = true } = body

    if (!repository_id || !branch_name) {
      return NextResponse.json(
        { error: 'repository_id and branch_name are required' },
        { status: 400 }
      )
    }

    // Check for service role auth first
    const authHeader = request.headers.get('authorization')
    const isServiceAuth = authHeader?.includes(process.env.SUPABASE_SERVICE_ROLE_KEY!)
    
    let userId: string | null = null
    let supabase: any

    if (isServiceAuth) {
      // Service-level access - check for x-supabase-auth header
      const supabaseAuthHeader = request.headers.get('x-supabase-auth')
      if (supabaseAuthHeader) {
        try {
          const authData = JSON.parse(supabaseAuthHeader)
          userId = authData.sub
        } catch (e) {
          console.error('[Branch Import] Invalid x-supabase-auth header')
        }
      }
      
      // Use service client
      supabase = await createServiceClient()
      console.log('[Branch Import] Using service authentication')
    } else {
      // Regular user authentication
      supabase = await createClient()
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      
      if (authError || !user) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        )
      }
      
      userId = user.id
      console.log('[Branch Import] Using user authentication')
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

    console.log(`[Branch Import] Importing branch ${branch_name} for repository ${repository.full_name}`)

    // Check if repository is public
    const isPublicRepo = !repository.private

    let githubClient: Octokit
    let hasAccess = false

    if (isPublicRepo) {
      // For public repos, we can use unauthenticated access
      console.log('[Branch Import] Repository is public, using unauthenticated access')
      githubClient = new Octokit({
        userAgent: 'supastate-github-integration'
      })
      hasAccess = true
    } else if (userId) {
      // For private repos, we need a user's GitHub token
      const { data: tokenData } = await supabase.rpc('get_github_token', {
        user_id: userId
      })

      if (tokenData) {
        githubClient = await createGitHubClient(tokenData)
        hasAccess = true
      } else {
        return NextResponse.json(
          { error: 'GitHub token required for private repository access' },
          { status: 403 }
        )
      }
    } else {
      return NextResponse.json(
        { error: 'Authentication required for private repository' },
        { status: 401 }
      )
    }

    if (!hasAccess) {
      return NextResponse.json(
        { error: 'No access to repository' },
        { status: 403 }
      )
    }

    // Check if branch exists on GitHub
    try {
      const { data: branchData } = await githubClient.repos.getBranch({
        owner: repository.owner,
        repo: repository.name,
        branch: branch_name
      })

      console.log(`[Branch Import] Branch ${branch_name} found on GitHub`)

      // Create or update branch record
      const { data: branch, error: branchError } = await supabase
        .from('github_indexed_branches')
        .upsert({
          repository_id: repository.id,
          branch_name: branch_name,
          base_branch: repository.default_branch,
          source: source,
          metadata: {
            sha: branchData.commit.sha,
            protected: branchData.protected
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

      // Compare with base branch if requested
      let filesDifferent = 0
      if (compare_to_base && branch_name !== repository.default_branch) {
        try {
          const { data: comparison } = await githubClient.repos.compareCommits({
            owner: repository.owner,
            repo: repository.name,
            base: repository.default_branch,
            head: branch_name
          })

          filesDifferent = comparison.files?.length || 0
          
          // Update branch record with comparison info
          await supabase
            .from('github_indexed_branches')
            .update({
              files_different_from_base: filesDifferent,
              metadata: {
                ...branch.metadata,
                comparison: {
                  ahead_by: comparison.ahead_by,
                  behind_by: comparison.behind_by,
                  total_commits: comparison.total_commits
                }
              }
            })
            .eq('id', branch.id)

          console.log(`[Branch Import] Branch differs by ${filesDifferent} files from ${repository.default_branch}`)
        } catch (error) {
          console.warn('[Branch Import] Could not compare branches:', error)
        }
      }

      // Queue crawl job
      const { error: crawlError } = await supabase
        .from('github_crawl_queue')
        .insert({
          repository_id: repository.id,
          crawl_type: 'branch',
          branch_name: branch_name,
          crawl_scope: filesDifferent > 0 ? 'delta' : 'full',
          priority: 5,
          data: {
            branch_id: branch.id,
            source: source,
            files_different: filesDifferent
          }
        })

      if (crawlError) {
        console.error('[Branch Import] Error queuing crawl job:', crawlError)
      }

      // Log activity
      await supabase.rpc('log_github_activity', {
        p_function_name: 'branch-import-api',
        p_level: 'info',
        p_message: `Branch ${branch_name} imported successfully`,
        p_repository_id: repository.id,
        p_repository_full_name: repository.full_name,
        p_details: {
          branch_name,
          source,
          files_different: filesDifferent,
          is_public: isPublicRepo
        }
      })

      return NextResponse.json({
        success: true,
        branch: {
          id: branch.id,
          name: branch_name,
          files_different: filesDifferent
        },
        message: `Branch ${branch_name} queued for import`
      })

    } catch (error: any) {
      if (error.status === 404) {
        return NextResponse.json(
          { error: `Branch ${branch_name} not found on GitHub` },
          { status: 404 }
        )
      }
      
      console.error('[Branch Import] GitHub API error:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to access GitHub' },
        { status: error.status || 500 }
      )
    }

  } catch (error: any) {
    console.error('[Branch Import] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}