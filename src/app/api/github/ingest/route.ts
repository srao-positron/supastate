import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { createGitHubClient } from '@/lib/github/client'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // This endpoint requires service role authentication
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.includes(process.env.SUPABASE_SERVICE_ROLE_KEY!)) {
      return NextResponse.json(
        { error: 'Unauthorized - Service role key required' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { repository_url, github_token, force_refresh = false, user_id } = body as {
      repository_url: string
      github_token?: string
      force_refresh?: boolean
      user_id?: string
    }

    if (!repository_url) {
      return NextResponse.json(
        { error: 'repository_url is required' },
        { status: 400 }
      )
    }

    // Parse repository URL
    const urlMatch = repository_url.match(/github\.com\/([^\/]+)\/([^\/]+)/)
    if (!urlMatch) {
      return NextResponse.json(
        { error: 'Invalid GitHub repository URL' },
        { status: 400 }
      )
    }

    const [, owner, name] = urlMatch
    const full_name = `${owner}/${name.replace(/\.git$/, '')}`

    console.log(`[GitHub Ingest] Manual ingestion requested for ${full_name}`)

    // If no token provided, try to get one from a user who has access
    let token = github_token
    if (!token && user_id) {
      const { data: tokenData } = await supabase.rpc('get_github_token', {
        user_id
      })
      token = tokenData
    }

    if (!token) {
      return NextResponse.json(
        { error: 'GitHub token is required - provide github_token or user_id with stored token' },
        { status: 400 }
      )
    }

    // Get repository info from GitHub
    const githubClient = await createGitHubClient(token)
    let repoData
    
    try {
      repoData = await githubClient.getRepository(owner, name.replace(/\.git$/, ''))
    } catch (error: any) {
      if (error.status === 404) {
        return NextResponse.json(
          { error: 'Repository not found or no access' },
          { status: 404 }
        )
      }
      throw error
    }

    // Check if repository exists
    const { data: existingRepo } = await supabase
      .from('github_repositories')
      .select('id, crawl_status, last_crawled_at')
      .eq('full_name', full_name)
      .single()

    let repositoryId: string

    if (existingRepo) {
      repositoryId = existingRepo.id

      // Update repository metadata
      const { error: updateError } = await supabase
        .from('github_repositories')
        .update({
          github_id: repoData.id,
          description: repoData.description,
          private: repoData.private,
          default_branch: repoData.default_branch,
          language: repoData.language,
          topics: repoData.topics,
          stars_count: repoData.stargazers_count,
          forks_count: repoData.forks_count,
          open_issues_count: repoData.open_issues_count,
          size_kb: repoData.size,
          github_created_at: repoData.created_at,
          github_updated_at: repoData.updated_at,
          github_pushed_at: repoData.pushed_at
        })
        .eq('id', repositoryId)

      if (updateError) {
        console.error('[GitHub Ingest] Failed to update repository:', updateError)
      }

      // Check if we should re-crawl
      if (!force_refresh && existingRepo.crawl_status === 'completed' && existingRepo.last_crawled_at) {
        const hoursSinceLastCrawl = (Date.now() - new Date(existingRepo.last_crawled_at).getTime()) / (1000 * 60 * 60)
        if (hoursSinceLastCrawl < 24) {
          return NextResponse.json({
            success: true,
            repository_id: repositoryId,
            message: 'Repository already crawled recently. Use force_refresh=true to re-crawl.',
            last_crawled_at: existingRepo.last_crawled_at
          })
        }
      }
    } else {
      // Create new repository
      const { data: newRepo, error: createError } = await supabase
        .from('github_repositories')
        .insert({
          github_id: repoData.id,
          owner,
          name: repoData.name,
          full_name,
          private: repoData.private,
          description: repoData.description,
          default_branch: repoData.default_branch,
          html_url: repoData.html_url,
          clone_url: repoData.clone_url,
          homepage: repoData.homepage,
          language: repoData.language,
          topics: repoData.topics,
          stars_count: repoData.stargazers_count,
          forks_count: repoData.forks_count,
          open_issues_count: repoData.open_issues_count,
          size_kb: repoData.size,
          github_created_at: repoData.created_at,
          github_updated_at: repoData.updated_at,
          github_pushed_at: repoData.pushed_at
        })
        .select('id')
        .single()

      if (createError) {
        console.error('[GitHub Ingest] Failed to create repository:', createError)
        return NextResponse.json(
          { error: 'Failed to create repository record' },
          { status: 500 }
        )
      }

      repositoryId = newRepo.id
    }

    // If user_id provided, ensure they have access
    if (user_id) {
      await supabase
        .from('github_user_repos')
        .upsert({
          user_id,
          repository_id: repositoryId,
          permissions: ['pull', 'push'], // Assume basic permissions
          role: 'collaborator',
          last_seen_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,repository_id'
        })
    }

    // Queue for crawling
    const crawlType = force_refresh ? 'manual' : 'update'
    const { data: queueResult, error: queueError } = await supabase.rpc('queue_github_crawl', {
      p_repository_id: repositoryId,
      p_crawl_type: crawlType,
      p_priority: 20, // High priority for manual ingestion
      p_data: {
        source: 'manual_ingest',
        force_refresh,
        github_token: token // Pass token for crawler to use
      }
    })

    if (queueError) {
      console.error('[GitHub Ingest] Failed to queue crawl:', queueError)
      return NextResponse.json(
        { error: 'Failed to queue repository for crawling' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      repository_id: repositoryId,
      queue_id: queueResult,
      message: `Repository ${full_name} queued for ${crawlType} crawl`,
      repository: {
        full_name,
        private: repoData.private,
        language: repoData.language,
        stars: repoData.stargazers_count
      }
    })

  } catch (error) {
    console.error('[GitHub Ingest] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}