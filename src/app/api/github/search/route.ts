import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getDriver } from '@/lib/neo4j/client'
import { generateEmbedding } from '@/lib/embeddings'
import { serializeNeo4jData } from '@/lib/utils/neo4j-serializer'

interface SearchFilters {
  repositories?: string[]
  entity_types?: string[]
  languages?: string[]
  date_range?: {
    start: string
    end: string
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check for service role auth or get current user
    let userId: string
    let supabase
    const authHeader = request.headers.get('authorization')
    
    if (authHeader?.includes(process.env.SUPABASE_SERVICE_ROLE_KEY!)) {
      // Service role auth - use service client
      supabase = await createServiceClient()
      userId = request.headers.get('x-user-id') || ''
      if (!userId) {
        return NextResponse.json(
          { error: 'x-user-id header required for service role auth' },
          { status: 400 }
        )
      }
    } else {
      // Regular user auth
      supabase = await createClient()
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        )
      }
      userId = user.id
    }

    const body = await request.json()
    const { query, filters, limit = 20 } = body as {
      query: string
      filters?: SearchFilters
      limit?: number
    }

    if (!query || query.trim().length === 0) {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      )
    }

    console.log(`[GitHub Search] User ${userId} searching for: "${query}"`)

    // Get user's accessible repositories
    const { data: userRepos, error: reposError } = await supabase
      .from('github_user_repos')
      .select('repository:github_repositories(id, full_name)')
      .eq('user_id', userId)

    if (reposError) {
      console.error('[GitHub Search] Error fetching user repos:', reposError)
      throw reposError
    }

    if (!userRepos || userRepos.length === 0) {
      return NextResponse.json({
        results: [],
        total: 0,
        message: 'No GitHub repositories found. Please connect your GitHub account.'
      })
    }

    const accessibleRepos = userRepos.map(ur => ur.repository.full_name)
    
    // Apply repository filter if provided
    const reposToSearch = filters?.repositories?.length 
      ? accessibleRepos.filter(repo => filters.repositories!.includes(repo))
      : accessibleRepos

    if (reposToSearch.length === 0) {
      return NextResponse.json({
        results: [],
        total: 0,
        message: 'No accessible repositories match your filters.'
      })
    }

    // Generate query embedding
    const queryEmbedding = await generateEmbedding(query)

    // Initialize Neo4j
    const driver = getDriver()
    const session = driver.session()

    try {
      const results = []

      // Search issues if requested or no filter
      if (!filters?.entity_types || filters.entity_types.includes('issues')) {
        const issueQuery = `
          CALL db.index.vector.queryNodes('github_issue_title_embedding', $limit, $embedding)
          YIELD node AS issue, score
          MATCH (issue)<-[:HAS_ISSUE]-(r:Repository)
          WHERE r.full_name IN $repos AND score > 0.5
          RETURN issue, r.full_name AS repo_name, score, 'issue' AS type
          ORDER BY score DESC
          LIMIT $limit
        `

        const issueResult = await session.run(issueQuery, {
          embedding: queryEmbedding,
          repos: reposToSearch,
          limit: parseInt(limit.toString())
        })

        for (const record of issueResult.records) {
          const issue = serializeNeo4jData(record.get('issue'))
          results.push({
            type: 'issue',
            score: record.get('score'),
            repository: record.get('repo_name'),
            data: {
              id: issue.id,
              number: issue.number,
              title: issue.title,
              body: issue.body?.substring(0, 500),
              state: issue.state,
              author: issue.author,
              labels: issue.labels,
              created_at: issue.created_at,
              updated_at: issue.updated_at
            }
          })
        }
      }

      // Search pull requests
      if (!filters?.entity_types || filters.entity_types.includes('pull_requests')) {
        const prQuery = `
          CALL db.index.vector.queryNodes('github_pr_title_embedding', $limit, $embedding)
          YIELD node AS pr, score
          MATCH (pr)<-[:HAS_PULL_REQUEST]-(r:Repository)
          WHERE r.full_name IN $repos AND score > 0.5
          RETURN pr, r.full_name AS repo_name, score, 'pull_request' AS type
          ORDER BY score DESC
          LIMIT $limit
        `

        const prResult = await session.run(prQuery, {
          embedding: queryEmbedding,
          repos: reposToSearch,
          limit: parseInt(limit.toString())
        })

        for (const record of prResult.records) {
          const pr = serializeNeo4jData(record.get('pr'))
          results.push({
            type: 'pull_request',
            score: record.get('score'),
            repository: record.get('repo_name'),
            data: {
              id: pr.id,
              number: pr.number,
              title: pr.title,
              body: pr.body?.substring(0, 500),
              state: pr.state,
              merged: pr.merged,
              author: pr.author,
              labels: pr.labels,
              created_at: pr.created_at,
              updated_at: pr.updated_at
            }
          })
        }
      }

      // Search commits
      if (!filters?.entity_types || filters.entity_types.includes('commits')) {
        const commitQuery = `
          CALL db.index.vector.queryNodes('github_commit_message_embedding', $limit, $embedding)
          YIELD node AS commit, score
          MATCH (commit)<-[:HAS_COMMIT]-(r:Repository)
          WHERE r.full_name IN $repos AND score > 0.5
          RETURN commit, r.full_name AS repo_name, score, 'commit' AS type
          ORDER BY score DESC
          LIMIT $limit
        `

        const commitResult = await session.run(commitQuery, {
          embedding: queryEmbedding,
          repos: reposToSearch,
          limit: parseInt(limit.toString())
        })

        for (const record of commitResult.records) {
          const commit = serializeNeo4jData(record.get('commit'))
          results.push({
            type: 'commit',
            score: record.get('score'),
            repository: record.get('repo_name'),
            data: {
              sha: commit.sha,
              message: commit.message,
              author: commit.author,
              author_email: commit.author_email,
              committed_at: commit.committed_at,
              additions: commit.additions,
              deletions: commit.deletions
            }
          })
        }
      }

      // Search code files
      if (!filters?.entity_types || filters.entity_types.includes('code')) {
        const codeQuery = `
          CALL db.index.vector.queryNodes('github_file_content_embedding', $limit, $embedding)
          YIELD node AS file, score
          MATCH (file)<-[:HAS_FILE]-(r:Repository)
          WHERE r.full_name IN $repos AND score > 0.55
          ${filters?.languages ? 'AND file.language IN $languages' : ''}
          RETURN file, r.full_name AS repo_name, score, 'code' AS type
          ORDER BY score DESC
          LIMIT $limit
        `

        const params: any = {
          embedding: queryEmbedding,
          repos: reposToSearch,
          limit: parseInt(limit.toString())
        }
        
        if (filters?.languages) {
          params.languages = filters.languages
        }

        const codeResult = await session.run(codeQuery, params)

        for (const record of codeResult.records) {
          const file = serializeNeo4jData(record.get('file'))
          results.push({
            type: 'code',
            score: record.get('score'),
            repository: record.get('repo_name'),
            data: {
              id: file.id,
              path: file.path,
              name: file.name,
              language: file.language,
              size: file.size,
              branch: file.branch,
              content_preview: file.content?.substring(0, 500)
            }
          })
        }
      }

      // Sort all results by score
      results.sort((a, b) => b.score - a.score)

      // Apply limit
      const finalResults = results.slice(0, limit)

      // Log search
      console.log(`[GitHub Search] Found ${finalResults.length} results for query: "${query}"`)

      return NextResponse.json({
        query,
        results: finalResults,
        total: finalResults.length,
        repositories_searched: reposToSearch.length,
        filters_applied: filters
      })

    } finally {
      await session.close()
    }

  } catch (error) {
    console.error('[GitHub Search] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}