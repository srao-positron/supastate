import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { createGitHubClient } from '@/lib/github/client'

export async function GET(request: NextRequest) {
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

    // Get repository_id from query params
    const searchParams = request.nextUrl.searchParams
    const repository_id = searchParams.get('repository_id')

    if (!repository_id) {
      return NextResponse.json(
        { error: 'repository_id is required' },
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

    // Get indexed branches from database
    const { data: indexedBranches, error: branchError } = await supabase
      .from('github_indexed_branches')
      .select('*')
      .eq('repository_id', repository_id)
      .order('indexed_at', { ascending: false })

    if (branchError) {
      console.error('[Branches API] Error fetching indexed branches:', branchError)
    }

    // Get GitHub token
    const { data: tokenData } = await supabase.rpc('get_github_token', {
      user_id: user.id
    })

    let remoteBranches: Array<{
      name: string
      commit_sha: string
      protected: boolean
      indexed: boolean
      indexed_at: string | null
      sync_status: string | null
      files_different: number | null
      is_default: boolean
    }> = []
    if (tokenData) {
      try {
        // Initialize GitHub client
        const githubClient = await createGitHubClient(tokenData)
        
        // Get all branches from GitHub
        const branches = await githubClient.listBranches(
          repository.owner,
          repository.name
        )

        // Map to include indexed status
        remoteBranches = branches.map(branch => {
          const indexed = indexedBranches?.find(b => b.branch_name === branch.name)
          return {
            name: branch.name,
            commit_sha: branch.commit.sha,
            protected: branch.protected,
            indexed: !!indexed,
            indexed_at: indexed?.indexed_at || null,
            sync_status: indexed?.sync_status || null,
            files_different: indexed?.files_different_from_base || null,
            is_default: branch.name === repository.default_branch
          }
        })
      } catch (error) {
        console.error('[Branches API] Error fetching GitHub branches:', error)
      }
    }

    return NextResponse.json({
      repository: {
        id: repository.id,
        full_name: repository.full_name,
        default_branch: repository.default_branch
      },
      indexed_branches: indexedBranches || [],
      remote_branches: remoteBranches,
      total_indexed: indexedBranches?.length || 0,
      total_remote: remoteBranches.length
    })

  } catch (error: any) {
    console.error('[Branches API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}