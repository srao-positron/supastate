import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { createGitHubClient } from '@/lib/github/client'
import { getDriver } from '@/lib/neo4j/client'
import { generateEmbedding } from '@/lib/embeddings'
import { serializeNeo4jData } from '@/lib/utils/neo4j-serializer'

export const maxDuration = 300 // 5 minutes for crawling

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  let apiCallCount = 0
  let job_id: string | undefined
  
  try {
    // This endpoint requires service role authentication
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.includes(process.env.SUPABASE_SERVICE_ROLE_KEY!)) {
      return NextResponse.json(
        { error: 'Unauthorized - Service role key required' },
        { status: 401 }
      )
    }
    
    // Use service client to bypass RLS
    const supabase = await createServiceClient()

    const body = await request.json()
    job_id = body.job_id

    if (!job_id) {
      return NextResponse.json(
        { error: 'job_id is required' },
        { status: 400 }
      )
    }

    // Log start (commenting out to test)
    // await supabase.rpc('log_github_activity', {
    //   p_function_name: 'github-crawl-api',
    //   p_level: 'info',
    //   p_message: 'Starting crawl job',
    //   p_job_id: job_id
    // })

    // Get job details - separate queries to avoid join issues
    console.log('[GitHub Crawl API] Fetching job:', job_id)
    
    const { data: jobData, error: jobError } = await supabase
      .from('github_crawl_queue')
      .select('*')
      .eq('id', job_id)
      .single()

    if (jobError || !jobData) {
      console.error('[GitHub Crawl API] Job fetch error:', jobError)
      throw new Error(`Job not found: ${jobError?.message || 'Unknown error'}`)
    }
    
    // Get repository details
    const { data: repository, error: repoError } = await supabase
      .from('github_repositories')
      .select('*')
      .eq('id', jobData.repository_id)
      .single()
      
    if (repoError || !repository) {
      console.error('[GitHub Crawl API] Repository fetch error:', repoError)
      throw new Error(`Repository not found: ${repoError?.message || 'Unknown error'}`)
    }
    
    // Combine the data
    const job = {
      ...jobData,
      github_repositories: repository
    }

    // Mark job as processing
    await supabase
      .from('github_crawl_queue')
      .update({
        status: 'processing',
        started_at: new Date().toISOString(),
        attempts: job.attempts + 1
      })
      .eq('id', job_id)

    // Get GitHub token
    let githubToken = job.data?.github_token

    if (!githubToken) {
      // Find a user with access
      const { data: userAccess } = await supabase
        .from('github_user_repos')
        .select('user_id')
        .eq('repository_id', job.repository_id)
        .order('last_seen_at', { ascending: false })
        .limit(1)
        .single()

      if (userAccess) {
        const { data: tokenData } = await supabase.rpc('get_github_token', {
          user_id: userAccess.user_id
        })
        githubToken = tokenData
      }
    }

    if (!githubToken) {
      throw new Error('No GitHub token available')
    }

    await supabase.rpc('log_github_activity', {
      p_function_name: 'github-crawl-api',
      p_level: 'debug',
      p_message: 'GitHub token obtained',
      p_job_id: job_id,
      p_repository_id: job.repository_id,
      p_repository_full_name: job.github_repositories.full_name,
      p_details: { token_prefix: githubToken.substring(0, 10) + '...' }
    })

    // Initialize clients
    const githubClient = await createGitHubClient(githubToken)
    const driver = getDriver()
    const session = driver.session()

    const entitiesProcessed = {
      repository: 0,
      issues: 0,
      pull_requests: 0,
      commits: 0,
      files: 0
    }

    try {
      // Update repository status
      await supabase
        .from('github_repositories')
        .update({
          crawl_status: 'crawling',
          crawl_started_at: new Date().toISOString()
        })
        .eq('id', job.repository_id)

      // Fetch repository data
      await supabase.rpc('log_github_activity', {
        p_function_name: 'github-crawl-api',
        p_level: 'info',
        p_message: 'Fetching repository data from GitHub',
        p_job_id: job_id,
        p_repository_id: job.repository_id,
        p_repository_full_name: job.github_repositories.full_name
      })

      apiCallCount++
      const repoData = await githubClient.getRepository(
        job.github_repositories.owner,
        job.github_repositories.name
      )

      // Log rate limit info
      const rateLimitInfo = githubClient.getRateLimitInfo()
      await supabase.rpc('log_github_activity', {
        p_function_name: 'github-crawl-api',
        p_level: 'debug',
        p_message: 'GitHub API rate limit status',
        p_job_id: job_id,
        p_repository_full_name: job.github_repositories.full_name,
        p_github_rate_limit_remaining: rateLimitInfo.remaining,
        p_github_rate_limit_reset: rateLimitInfo.reset,
        p_details: { api_endpoint: 'repos.get' }
      })

      // Generate embedding for description
      let descriptionEmbedding: number[] = []
      if (repoData.description) {
        try {
          descriptionEmbedding = await generateEmbedding(repoData.description)
        } catch (error) {
          await supabase.rpc('log_github_activity', {
            p_function_name: 'github-crawl-api',
            p_level: 'warning',
            p_message: 'Failed to generate repository description embedding',
            p_job_id: job_id,
            p_repository_full_name: job.github_repositories.full_name,
            p_error_code: 'EMBEDDING_FAILED',
            p_details: { error: String(error) }
          })
        }
      }

      // Create/update repository in Neo4j
      await session.run(
        `
        MERGE (r:Repository {github_id: $github_id})
        SET r += {
          full_name: $full_name,
          owner: $owner,
          name: $name,
          description: $description,
          private: $private,
          default_branch: $default_branch,
          language: $language,
          topics: $topics,
          stars_count: $stars_count,
          created_at: datetime($created_at),
          updated_at: datetime($updated_at),
          description_embedding: $description_embedding
        }
        `,
        {
          github_id: repoData.id,
          full_name: job.github_repositories.full_name,
          owner: job.github_repositories.owner,
          name: job.github_repositories.name,
          description: repoData.description || '',
          private: repoData.private,
          default_branch: repoData.default_branch || 'main',
          language: repoData.language || null,
          topics: repoData.topics || [],
          stars_count: repoData.stargazers_count,
          created_at: repoData.created_at,
          updated_at: repoData.updated_at,
          description_embedding: descriptionEmbedding
        }
      )
      entitiesProcessed.repository = 1

      // Update repository in PostgreSQL
      await supabase
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
        .eq('id', job.repository_id)

      // Determine what to crawl
      let crawlTargets = []
      if (job.crawl_type === 'initial' || job.crawl_type === 'manual') {
        crawlTargets = ['issues', 'pulls', 'commits', 'files']
      } else if (job.crawl_type === 'webhook') {
        crawlTargets = job.data.updates || []
      } else if (job.crawl_type === 'update') {
        crawlTargets = ['issues', 'pulls', 'commits']
      }

      // Crawl issues
      if (crawlTargets.includes('issues')) {
        await supabase.rpc('log_github_activity', {
          p_function_name: 'github-crawl-api',
          p_level: 'info',
          p_message: 'Starting issues crawl',
          p_job_id: job_id,
          p_repository_full_name: job.github_repositories.full_name
        })

        try {
          const issues = await githubClient.listIssues(
            job.github_repositories.owner,
            job.github_repositories.name,
            { state: 'all', per_page: 100 }
          )
          
          apiCallCount++

          await supabase.rpc('log_github_activity', {
            p_function_name: 'github-crawl-api',
            p_level: 'info',
            p_message: `Found ${issues.length} issues to process`,
            p_job_id: job_id,
            p_repository_full_name: job.github_repositories.full_name,
            p_details: { issue_count: issues.length }
          })

          for (const issue of issues) {
            // Skip pull requests
            if (issue.pull_request) continue

            const titleEmbedding = await generateEmbedding(issue.title)
            const bodyEmbedding = issue.body ? await generateEmbedding(issue.body) : []

            await session.run(
              `
              MERGE (i:RepoIssue {id: $id})
              SET i += {
                github_id: $github_id,
                number: $number,
                title: $title,
                body: $body,
                state: $state,
                author: $author,
                labels: $labels,
                created_at: datetime($created_at),
                updated_at: datetime($updated_at),
                closed_at: $closed_at,
                title_embedding: $title_embedding,
                body_embedding: $body_embedding
              }
              WITH i
              MATCH (r:Repository {github_id: $repo_github_id})
              MERGE (r)-[:HAS_ISSUE]->(i)
              `,
              {
                id: `${job.github_repositories.full_name}#${issue.number}`,
                github_id: issue.id,
                number: issue.number,
                title: issue.title,
                body: issue.body || '',
                state: issue.state,
                author: issue.user?.login || 'unknown',
                labels: issue.labels.map((l: any) => l.name),
                created_at: issue.created_at,
                updated_at: issue.updated_at,
                closed_at: issue.closed_at,
                title_embedding: titleEmbedding,
                body_embedding: bodyEmbedding,
                repo_github_id: repoData.id
              }
            )
            entitiesProcessed.issues++
          }
        } catch (error: any) {
          await supabase.rpc('log_github_activity', {
            p_function_name: 'github-crawl-api',
            p_level: 'error',
            p_message: 'Failed to crawl issues',
            p_job_id: job_id,
            p_repository_full_name: job.github_repositories.full_name,
            p_error_code: error.status || 'UNKNOWN',
            p_error_stack: error.stack,
            p_details: { error: String(error) }
          })
          throw error
        }
      }

      // Crawl pull requests
      if (crawlTargets.includes('pulls')) {
        await supabase.rpc('log_github_activity', {
          p_function_name: 'github-crawl-api',
          p_level: 'info',
          p_message: 'Starting pull requests crawl',
          p_job_id: job_id,
          p_repository_full_name: job.github_repositories.full_name
        })

        try {
          const pulls = await githubClient.listIssues(
            job.github_repositories.owner,
            job.github_repositories.name,
            { state: 'all', per_page: 100 }
          )
          
          apiCallCount++

          // Filter for PRs (they come through issues API)
          const pullRequests = pulls.filter((issue: any) => issue.pull_request)

          await supabase.rpc('log_github_activity', {
            p_function_name: 'github-crawl-api',
            p_level: 'info',
            p_message: `Found ${pullRequests.length} pull requests to process`,
            p_job_id: job_id,
            p_repository_full_name: job.github_repositories.full_name,
            p_details: { pr_count: pullRequests.length }
          })

          for (const pr of pullRequests) {
            // Get full PR details
            const prDetails = await githubClient.getPullRequest(
              job.github_repositories.owner,
              job.github_repositories.name,
              pr.number
            )
            apiCallCount++

            const titleEmbedding = await generateEmbedding(pr.title)
            const bodyEmbedding = pr.body ? await generateEmbedding(pr.body) : []

            await session.run(
              `
              MERGE (pr:RepoPullRequest {id: $id})
              SET pr += {
                github_id: $github_id,
                number: $number,
                title: $title,
                body: $body,
                state: $state,
                author: $author,
                labels: $labels,
                created_at: datetime($created_at),
                updated_at: datetime($updated_at),
                closed_at: $closed_at,
                merged: $merged,
                merged_at: $merged_at,
                head_ref: $head_ref,
                base_ref: $base_ref,
                additions: $additions,
                deletions: $deletions,
                changed_files: $changed_files,
                title_embedding: $title_embedding,
                body_embedding: $body_embedding
              }
              WITH pr
              MATCH (r:Repository {github_id: $repo_github_id})
              MERGE (r)-[:HAS_PULL_REQUEST]->(pr)
              `,
              {
                id: `${job.github_repositories.full_name}#${pr.number}`,
                github_id: pr.id,
                number: pr.number,
                title: pr.title,
                body: pr.body || '',
                state: pr.state,
                author: pr.user?.login || 'unknown',
                labels: pr.labels.map((l: any) => l.name),
                created_at: pr.created_at,
                updated_at: pr.updated_at,
                closed_at: pr.closed_at,
                merged: prDetails.merged || false,
                merged_at: prDetails.merged_at,
                head_ref: prDetails.head?.ref || '',
                base_ref: prDetails.base?.ref || '',
                additions: prDetails.additions || 0,
                deletions: prDetails.deletions || 0,
                changed_files: prDetails.changed_files || 0,
                title_embedding: titleEmbedding,
                body_embedding: bodyEmbedding,
                repo_github_id: repoData.id
              }
            )
            entitiesProcessed.pull_requests++
          }
        } catch (error: any) {
          await supabase.rpc('log_github_activity', {
            p_function_name: 'github-crawl-api',
            p_level: 'error',
            p_message: 'Failed to crawl pull requests',
            p_job_id: job_id,
            p_repository_full_name: job.github_repositories.full_name,
            p_error_code: error.status || 'UNKNOWN',
            p_error_stack: error.stack,
            p_details: { error: String(error) }
          })
          throw error
        }
      }

      // Crawl commits
      if (crawlTargets.includes('commits')) {
        await supabase.rpc('log_github_activity', {
          p_function_name: 'github-crawl-api',
          p_level: 'info',
          p_message: 'Starting commits crawl',
          p_job_id: job_id,
          p_repository_full_name: job.github_repositories.full_name
        })

        try {
          // Get recent commits (last 100)
          const commits = await githubClient.listCommits(
            job.github_repositories.owner,
            job.github_repositories.name,
            { per_page: 100 }
          )
          
          apiCallCount++

          await supabase.rpc('log_github_activity', {
            p_function_name: 'github-crawl-api',
            p_level: 'info',
            p_message: `Found ${commits.length} commits to process`,
            p_job_id: job_id,
            p_repository_full_name: job.github_repositories.full_name,
            p_details: { commit_count: commits.length }
          })

          for (const commit of commits) {
            const messageEmbedding = await generateEmbedding(commit.commit.message)

            await session.run(
              `
              MERGE (c:RepoCommit {sha: $sha})
              SET c += {
                message: $message,
                author: $author,
                author_email: $author_email,
                committed_at: datetime($committed_at),
                additions: $additions,
                deletions: $deletions,
                message_embedding: $message_embedding
              }
              WITH c
              MATCH (r:Repository {github_id: $repo_github_id})
              MERGE (r)-[:HAS_COMMIT]->(c)
              `,
              {
                sha: commit.sha,
                message: commit.commit.message,
                author: commit.commit.author?.name || 'unknown',
                author_email: commit.commit.author?.email || '',
                committed_at: commit.commit.author?.date || commit.commit.committer?.date,
                additions: commit.stats?.additions || 0,
                deletions: commit.stats?.deletions || 0,
                message_embedding: messageEmbedding,
                repo_github_id: repoData.id
              }
            )
            entitiesProcessed.commits++
          }
        } catch (error: any) {
          await supabase.rpc('log_github_activity', {
            p_function_name: 'github-crawl-api',
            p_level: 'error',
            p_message: 'Failed to crawl commits',
            p_job_id: job_id,
            p_repository_full_name: job.github_repositories.full_name,
            p_error_code: error.status || 'UNKNOWN',
            p_error_stack: error.stack,
            p_details: { error: String(error) }
          })
          throw error
        }
      }

      // Crawl files and code content
      if (crawlTargets.includes('files')) {
        await supabase.rpc('log_github_activity', {
          p_function_name: 'github-crawl-api',
          p_level: 'info',
          p_message: 'Starting code content crawl',
          p_job_id: job_id,
          p_repository_full_name: job.github_repositories.full_name
        })

        try {
          // Get repository tree
          const tree = await githubClient.getTree(
            job.github_repositories.owner,
            job.github_repositories.name,
            job.github_repositories.default_branch || 'main',
            true // recursive
          )
          
          apiCallCount++

          // Filter for code files
          const codeExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '.rs', '.cpp', '.c', '.h']
          const codeFiles = tree.tree.filter((item: any) => 
            item.type === 'blob' && 
            codeExtensions.some(ext => item.path.endsWith(ext)) &&
            item.size < 100000 // Skip large files
          )

          await supabase.rpc('log_github_activity', {
            p_function_name: 'github-crawl-api',
            p_level: 'info',
            p_message: `Found ${codeFiles.length} code files to process`,
            p_job_id: job_id,
            p_repository_full_name: job.github_repositories.full_name,
            p_details: { file_count: codeFiles.length }
          })

          // Process files in batches to avoid rate limits
          const batchSize = 10
          for (let i = 0; i < codeFiles.length; i += batchSize) {
            const batch = codeFiles.slice(i, i + batchSize)
            
            for (const file of batch) {
              try {
                // Get file content
                const content = await githubClient.getContent(
                  job.github_repositories.owner,
                  job.github_repositories.name,
                  file.path
                )
                apiCallCount++

                if (Array.isArray(content) || content.type !== 'file') continue

                // Decode base64 content
                const decodedContent = Buffer.from(content.content, 'base64').toString('utf-8')
                
                // For now, just store the file - parsing will come later
                const contentEmbedding = await generateEmbedding(decodedContent.substring(0, 4000))

                await session.run(
                  `
                  MERGE (f:RepoFile {id: $id})
                  SET f += {
                    path: $path,
                    name: $name,
                    type: 'code',
                    language: $language,
                    size: $size,
                    content: $content,
                    branch: $branch,
                    commit_sha: $commit_sha,
                    content_embedding: $content_embedding
                  }
                  WITH f
                  MATCH (r:Repository {github_id: $repo_github_id})
                  MERGE (r)-[:HAS_FILE]->(f)
                  `,
                  {
                    id: `${job.github_repositories.full_name}#${file.path}`,
                    path: file.path,
                    name: file.path.split('/').pop(),
                    language: file.path.split('.').pop(),
                    size: file.size,
                    content: decodedContent,
                    branch: job.github_repositories.default_branch || 'main',
                    commit_sha: content.sha,
                    content_embedding: contentEmbedding,
                    repo_github_id: repoData.id
                  }
                )
                entitiesProcessed.files++
              } catch (fileError: any) {
                await supabase.rpc('log_github_activity', {
                  p_function_name: 'github-crawl-api',
                  p_level: 'warning',
                  p_message: `Failed to process file ${file.path}`,
                  p_job_id: job_id,
                  p_repository_full_name: job.github_repositories.full_name,
                  p_error_code: fileError.status || 'FILE_ERROR',
                  p_details: { file: file.path, error: String(fileError) }
                })
              }
            }

            // Rate limit pause between batches
            if (i + batchSize < codeFiles.length) {
              await new Promise(resolve => setTimeout(resolve, 1000))
            }
          }
        } catch (error: any) {
          await supabase.rpc('log_github_activity', {
            p_function_name: 'github-crawl-api',
            p_level: 'error',
            p_message: 'Failed to crawl code content',
            p_job_id: job_id,
            p_repository_full_name: job.github_repositories.full_name,
            p_error_code: error.status || 'UNKNOWN',
            p_error_stack: error.stack,
            p_details: { error: String(error) }
          })
          // Don't throw - files are optional
        }
      }

      // Install webhook for initial crawls
      if (job.crawl_type === 'initial' && !job.github_repositories.webhook_id) {
        await supabase.rpc('log_github_activity', {
          p_function_name: 'github-crawl-api',
          p_level: 'info',
          p_message: 'Installing webhook for repository',
          p_job_id: job_id,
          p_repository_full_name: job.github_repositories.full_name
        })

        try {
          // Generate webhook secret
          const webhookSecret = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2)
          const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://supastate.com'}/api/github/webhook/${job.repository_id}`

          const webhook = await githubClient.createWebhook(
            job.github_repositories.owner,
            job.github_repositories.name,
            {
              url: webhookUrl,
              secret: webhookSecret
            }
          )
          apiCallCount++

          // Store webhook info
          await supabase
            .from('github_repositories')
            .update({
              webhook_id: webhook.id,
              webhook_secret: webhookSecret,
              webhook_installed_at: new Date().toISOString()
            })
            .eq('id', job.repository_id)

          await supabase.rpc('log_github_activity', {
            p_function_name: 'github-crawl-api',
            p_level: 'info',
            p_message: 'Webhook installed successfully',
            p_job_id: job_id,
            p_repository_full_name: job.github_repositories.full_name,
            p_details: { webhook_id: webhook.id, webhook_url: webhookUrl }
          })
        } catch (webhookError: any) {
          await supabase.rpc('log_github_activity', {
            p_function_name: 'github-crawl-api',
            p_level: 'warning',
            p_message: 'Failed to install webhook',
            p_job_id: job_id,
            p_repository_full_name: job.github_repositories.full_name,
            p_error_code: webhookError.status || 'WEBHOOK_ERROR',
            p_details: { error: String(webhookError) }
          })
          // Don't throw - webhook is optional
        }
      }

      // Mark crawl as completed
      const duration = Date.now() - startTime

      await supabase
        .from('github_repositories')
        .update({
          crawl_status: 'completed',
          crawl_completed_at: new Date().toISOString(),
          last_crawled_at: new Date().toISOString()
        })
        .eq('id', job.repository_id)

      await supabase
        .from('github_crawl_queue')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', job_id)

      // Get final rate limit info
      const finalRateLimitInfo = githubClient.getRateLimitInfo()
      
      // Record crawl history
      await supabase
        .from('github_crawl_history')
        .insert({
          repository_id: job.repository_id,
          crawl_type: job.crawl_type,
          entities_processed: entitiesProcessed,
          status: 'completed',
          duration_seconds: Math.floor(duration / 1000),
          api_calls_made: apiCallCount,
          rate_limit_remaining: finalRateLimitInfo.remaining
        })

      await supabase.rpc('log_github_activity', {
        p_function_name: 'github-crawl-api',
        p_level: 'info',
        p_message: 'Crawl completed successfully',
        p_job_id: job_id,
        p_repository_id: job.repository_id,
        p_repository_full_name: job.github_repositories.full_name,
        p_duration_ms: duration,
        p_api_calls_count: apiCallCount,
        p_entities_processed: entitiesProcessed
      })

      return NextResponse.json({
        success: true,
        job_id,
        repository: job.github_repositories.full_name,
        entities_processed: entitiesProcessed,
        duration_ms: duration,
        api_calls: apiCallCount
      })

    } finally {
      await session.close()
      await driver.close()
    }

  } catch (error: any) {
    console.error('[GitHub Crawl API] Error:', error)
    
    const duration = Date.now() - startTime
    
    if (job_id) {
      const supabase = await createServiceClient()
      
      await supabase.rpc('log_github_activity', {
        p_function_name: 'github-crawl-api',
        p_level: 'error',
        p_message: 'Crawl failed with error',
        p_job_id: job_id,
        p_duration_ms: duration,
        p_api_calls_count: apiCallCount,
        p_error_code: error.status || error.code || 'UNKNOWN',
        p_error_stack: error.stack,
        p_details: { error: String(error) }
      })

      // Update job status
      await supabase
        .from('github_crawl_queue')
        .update({
          status: 'failed',
          error: error.message || 'Unknown error',
          error_details: { error: String(error), stack: error.stack },
          completed_at: new Date().toISOString()
        })
        .eq('id', job_id)
    }

    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}