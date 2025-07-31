import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

interface DiscoverRepository {
  full_name: string // owner/name
  url: string
  permissions?: string[]
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Verify service role or authenticated user
    const authHeader = request.headers.get('authorization')
    const isServiceRole = authHeader?.includes(process.env.SUPABASE_SERVICE_ROLE_KEY!)
    
    if (!isServiceRole) {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        )
      }
    }

    const body = await request.json()
    const { user_id, repositories } = body as {
      user_id: string
      repositories: DiscoverRepository[]
    }

    if (!user_id || !repositories || !Array.isArray(repositories)) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      )
    }

    console.log(`[GitHub Discover] Processing ${repositories.length} repositories for user ${user_id}`)

    const results = {
      discovered: [] as string[],
      queued: [] as string[],
      errors: [] as { repo: string; error: string }[]
    }

    // Process each repository
    for (const repo of repositories) {
      try {
        // Parse owner and name from full_name
        const [owner, name] = repo.full_name.split('/')
        if (!owner || !name) {
          results.errors.push({
            repo: repo.full_name,
            error: 'Invalid repository name format'
          })
          continue
        }

        // Check if repository exists in our system
        const { data: existingRepo, error: repoError } = await supabase
          .from('github_repositories')
          .select('id, crawl_status')
          .eq('full_name', repo.full_name)
          .single()

        let repositoryId: string

        if (repoError && repoError.code === 'PGRST116') {
          // Repository doesn't exist, create it
          console.log(`[GitHub Discover] Creating new repository: ${repo.full_name}`)
          
          // We'll need to fetch basic info from GitHub
          // For now, create with minimal info - the crawler will fill in details
          const { data: newRepo, error: createError } = await supabase
            .from('github_repositories')
            .insert({
              github_id: Date.now(), // Temporary - crawler will update
              owner,
              name,
              full_name: repo.full_name,
              html_url: repo.url,
              clone_url: `https://github.com/${repo.full_name}.git`,
              private: false, // Will be updated by crawler
              github_created_at: new Date().toISOString(),
              github_updated_at: new Date().toISOString()
            })
            .select('id')
            .single()

          if (createError) {
            console.error(`[GitHub Discover] Failed to create repo ${repo.full_name}:`, createError)
            results.errors.push({
              repo: repo.full_name,
              error: 'Failed to create repository record'
            })
            continue
          }

          repositoryId = newRepo.id

          // Queue for initial crawl
          const { error: queueError } = await supabase.rpc('queue_github_crawl', {
            p_repository_id: repositoryId,
            p_crawl_type: 'initial',
            p_priority: 10, // Higher priority for new repos
            p_data: { source: 'discovery' }
          })

          if (queueError) {
            console.error(`[GitHub Discover] Failed to queue crawl for ${repo.full_name}:`, queueError)
          } else {
            results.queued.push(repo.full_name)
          }
        } else if (existingRepo) {
          repositoryId = existingRepo.id
          
          // If repo hasn't been crawled yet, increase its priority
          if (existingRepo.crawl_status === 'pending') {
            await supabase.rpc('queue_github_crawl', {
              p_repository_id: repositoryId,
              p_crawl_type: 'initial',
              p_priority: 15, // Boost priority since user has access
              p_data: { source: 'discovery_boost' }
            })
            results.queued.push(repo.full_name)
          }
        } else {
          throw repoError
        }

        // Update user access record
        const { error: accessError } = await supabase
          .from('github_user_repos')
          .upsert({
            user_id,
            repository_id: repositoryId,
            permissions: repo.permissions || ['pull'],
            last_seen_at: new Date().toISOString()
          }, {
            onConflict: 'user_id,repository_id'
          })

        if (accessError) {
          console.error(`[GitHub Discover] Failed to update access for ${repo.full_name}:`, accessError)
          results.errors.push({
            repo: repo.full_name,
            error: 'Failed to update access record'
          })
        } else {
          results.discovered.push(repo.full_name)
        }

      } catch (error) {
        console.error(`[GitHub Discover] Error processing ${repo.full_name}:`, error)
        results.errors.push({
          repo: repo.full_name,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    console.log(`[GitHub Discover] Complete. Discovered: ${results.discovered.length}, Queued: ${results.queued.length}, Errors: ${results.errors.length}`)

    return NextResponse.json({
      success: true,
      results
    })

  } catch (error) {
    console.error('[GitHub Discover] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}