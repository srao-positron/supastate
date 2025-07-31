import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.2'
import { Octokit } from 'https://esm.sh/@octokit/rest@19.0.11'
import neo4j from 'https://unpkg.com/neo4j-driver@5.12.0/lib/browser/neo4j-web.esm.js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper to log GitHub activities
async function logGitHubActivity(
  supabase: any,
  level: 'debug' | 'info' | 'warning' | 'error' | 'fatal',
  message: string,
  options?: {
    details?: any
    repository_id?: string
    repository_full_name?: string
    job_id?: string
    error_code?: string
    error_stack?: string
    duration_ms?: number
    api_calls_count?: number
    entities_processed?: any
    github_rate_limit_remaining?: number
    github_rate_limit_reset?: Date
  }
) {
  try {
    await supabase.rpc('log_github_activity', {
      p_function_name: 'github-crawl-worker',
      p_level: level,
      p_message: message,
      p_details: options?.details || {},
      p_repository_id: options?.repository_id || null,
      p_repository_full_name: options?.repository_full_name || null,
      p_job_id: options?.job_id || null,
      p_error_code: options?.error_code || null,
      p_error_stack: options?.error_stack || null,
      p_duration_ms: options?.duration_ms || null,
      p_api_calls_count: options?.api_calls_count || null,
      p_entities_processed: options?.entities_processed || null,
      p_github_rate_limit_remaining: options?.github_rate_limit_remaining || null,
      p_github_rate_limit_reset: options?.github_rate_limit_reset || null
    })
  } catch (err) {
    console.error('Failed to log to github_ingestion_logs:', err)
  }
}

interface CrawlJob {
  job_id: string
  repository: {
    id: string
    full_name: string
    owner: string
    name: string
    default_branch: string
    private: boolean
  }
  crawl_type: 'initial' | 'update' | 'webhook' | 'manual'
  crawl_data: any
  github_token: string
}

// Helper to generate embeddings
async function generateEmbedding(text: string): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    return []
  }

  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-large',
        input: text.substring(0, 8000), // Limit input size
        dimensions: 3072
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`)
    }

    const data = await response.json()
    return data.data[0].embedding
  } catch (error) {
    console.error('[GitHub Crawl Worker] Embedding generation failed:', error)
    return []
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const startTime = Date.now()
  let apiCallCount = 0

  try {
    const { batch_size = 1 } = await req.json()
    
    console.log(`[GitHub Crawl Worker] Starting to process ${batch_size} jobs from queue`)
    
    // Read messages from PGMQ queue
    const { data: messages, error: readError } = await supabase.rpc('pgmq_read', {
      queue_name: 'github_crawl',
      vt: 600, // 10 minute visibility timeout
      qty: batch_size
    })
    
    if (readError || !messages || messages.length === 0) {
      console.log('[GitHub Crawl Worker] No messages to process')
      return new Response(
        JSON.stringify({ 
          processed: 0, 
          message: 'No messages to process',
          error: readError?.message 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    console.log(`[GitHub Crawl Worker] Found ${messages.length} messages to process`)
    
    const results = []
    const processedIds = []
    
    for (const msg of messages) {
      const job: CrawlJob = msg.message
      
      if (!job || !job.repository) {
        console.error('[GitHub Crawl Worker] Invalid job structure:', msg)
        processedIds.push(msg.msg_id)
        continue
      }
    
      console.log(`[GitHub Crawl Worker] Processing job ${job.job_id} for ${job.repository.full_name}`)
      await logGitHubActivity(supabase, 'info', `Starting crawl for ${job.repository.full_name}`, {
        job_id: job.job_id,
        repository_id: job.repository.id,
        repository_full_name: job.repository.full_name,
        details: { crawl_type: job.crawl_type }
      })
      
      try {

        // Initialize GitHub client
        const octokit = new Octokit({
          auth: job.github_token,
        })

        // Initialize Neo4j
        const driver = neo4j.driver(
          Deno.env.get('NEO4J_URI') ?? '',
          neo4j.auth.basic(
            Deno.env.get('NEO4J_USER') ?? '',
            Deno.env.get('NEO4J_PASSWORD') ?? ''
          )
        )

        const session = driver.session()
        const entitiesProcessed = {
          repository: 0,
          issues: 0,
          pull_requests: 0,
          commits: 0,
          files: 0,
          functions: 0,
          classes: 0
        }
        // Mark job as processing in github_crawl_queue
        await supabase
          .from('github_crawl_queue')
          .update({
            status: 'processing',
            started_at: new Date().toISOString()
          })
          .eq('id', job.job_id)

        // Start crawl
        await supabase
          .from('github_repositories')
          .update({
            crawl_status: 'crawling',
            crawl_started_at: new Date().toISOString()
          })
          .eq('id', job.repository.id)

      // Create or update repository node in Neo4j
      console.log(`[GitHub Crawl Worker] Creating repository node`)
      
      const repoData = await octokit.repos.get({
        owner: job.repository.owner,
        repo: job.repository.name
      })

      // Generate embedding for repository description
      const descriptionEmbedding = repoData.data.description 
        ? await generateEmbedding(repoData.data.description)
        : []

      await logGitHubActivity(supabase, 'debug', 'Creating/updating repository node in Neo4j', {
        job_id: job.job_id,
        repository_full_name: job.repository.full_name,
        details: { 
          github_id: repoData.data.id,
          has_embedding: descriptionEmbedding.length > 0
        }
      })
      
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
          github_id: neo4j.int(repoData.data.id),
          full_name: job.repository.full_name,
          owner: job.repository.owner,
          name: job.repository.name,
          description: repoData.data.description || '',
          private: repoData.data.private,
          default_branch: repoData.data.default_branch || 'main',
          language: repoData.data.language || null,
          topics: repoData.data.topics || [],
          stars_count: neo4j.int(repoData.data.stargazers_count),
          created_at: repoData.data.created_at,
          updated_at: repoData.data.updated_at,
          description_embedding: descriptionEmbedding
        }
      )
      entitiesProcessed.repository = 1

      // Update repository metadata in PostgreSQL
      await supabase
        .from('github_repositories')
        .update({
          github_id: repoData.data.id,
          description: repoData.data.description,
          private: repoData.data.private,
          default_branch: repoData.data.default_branch,
          language: repoData.data.language,
          topics: repoData.data.topics,
          stars_count: repoData.data.stargazers_count,
          forks_count: repoData.data.forks_count,
          open_issues_count: repoData.data.open_issues_count,
          size_kb: repoData.data.size,
          github_created_at: repoData.data.created_at,
          github_updated_at: repoData.data.updated_at,
          github_pushed_at: repoData.data.pushed_at
        })
        .eq('id', job.repository.id)

      // Determine what to crawl based on crawl_type
      let crawlTargets = []
      
      if (job.crawl_type === 'initial' || job.crawl_type === 'manual') {
        crawlTargets = ['issues', 'pulls', 'commits', 'files']
      } else if (job.crawl_type === 'webhook') {
        crawlTargets = job.crawl_data.updates || []
      } else if (job.crawl_type === 'update') {
        crawlTargets = ['issues', 'pulls', 'commits'] // Skip files on regular updates
      }

      // Crawl issues
      if (crawlTargets.includes('issues')) {
        console.log(`[GitHub Crawl Worker] Crawling issues`)
        
        const issues = await octokit.paginate(octokit.issues.listForRepo, {
          owner: job.repository.owner,
          repo: job.repository.name,
          state: 'all',
          per_page: 100
        })

        for (const issue of issues) {
          // Skip pull requests (they come through issues API too)
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
              id: `${job.repository.full_name}#${issue.number}`,
              github_id: neo4j.int(issue.id),
              number: neo4j.int(issue.number),
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
              repo_github_id: neo4j.int(repoData.data.id)
            }
          )
          entitiesProcessed.issues++
        }
      }

      // TODO: Implement other crawl targets (pulls, commits, files)
      // This is a basic implementation - you'll need to expand this

      // Mark crawl as completed
      await supabase
        .from('github_repositories')
        .update({
          crawl_status: 'completed',
          crawl_completed_at: new Date().toISOString(),
          last_crawled_at: new Date().toISOString()
        })
        .eq('id', job.repository.id)

      // Update crawl queue
      await supabase
        .from('github_crawl_queue')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', job.job_id)

      // Record crawl history
      await supabase
        .from('github_crawl_history')
        .insert({
          repository_id: job.repository.id,
          crawl_type: job.crawl_type,
          entities_processed: entitiesProcessed,
          status: 'completed',
          duration_seconds: Math.floor((Date.now() - new Date().getTime()) / 1000),
          api_calls_made: 10 // TODO: Track actual API calls
        })

        await session.close()
        await driver.close()
        
        console.log(`[GitHub Crawl Worker] Completed crawl for ${job.repository.full_name}`, entitiesProcessed)
        
        processedIds.push(msg.msg_id)
        results.push({
          job_id: job.job_id,
          repository: job.repository.full_name,
          status: 'completed',
          entities_processed: entitiesProcessed
        })
        
      } catch (jobError) {
        console.error(`[GitHub Crawl Worker] Error processing job ${job.job_id}:`, jobError)
        
        // Update job status to failed
        await supabase
          .from('github_crawl_queue')
          .update({
            status: 'failed',
            error: jobError.message || 'Unknown error',
            error_details: { error: String(jobError), stack: jobError.stack },
            completed_at: new Date().toISOString()
          })
          .eq('id', job.job_id)

        // Update repository status
        await supabase
          .from('github_repositories')
          .update({
            crawl_status: 'failed',
            crawl_error: jobError.message || 'Unknown error'
          })
          .eq('id', job.repository.id)
          
        await logGitHubActivity(supabase, 'error', 'Job processing failed', {
          job_id: job.job_id,
          repository_id: job.repository.id,
          repository_full_name: job.repository.full_name,
          error_code: jobError.code || 'UNKNOWN',
          error_stack: jobError.stack,
          details: { error: String(jobError) }
        })
        
        // Still mark message as processed to avoid infinite retries
        processedIds.push(msg.msg_id)
        results.push({
          job_id: job.job_id,
          repository: job.repository.full_name,
          status: 'failed',
          error: jobError.message
        })
      }
    }
    
    // Delete processed messages from queue
    if (processedIds.length > 0) {
      await supabase.rpc('pgmq_delete', {
        queue_name: 'github_crawl',
        msg_ids: processedIds
      })
    }
    
    return new Response(
      JSON.stringify({
        processed: processedIds.length,
        results
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error('[GitHub Crawl Worker] Fatal error:', error)
    await logGitHubActivity(supabase, 'fatal', 'Worker fatal error', {
      error_code: error.code || 'FATAL',
      error_stack: error.stack,
      details: { error: String(error) }
    })
    
    return new Response(
      JSON.stringify({ 
        error: error.message,
        stack: error.stack 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})