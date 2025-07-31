import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.2'

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
  }
) {
  try {
    await supabase.rpc('log_github_activity', {
      p_function_name: 'github-crawl-coordinator',
      p_level: level,
      p_message: message,
      p_details: options?.details || {},
      p_repository_id: options?.repository_id || null,
      p_repository_full_name: options?.repository_full_name || null,
      p_job_id: options?.job_id || null,
      p_error_code: options?.error_code || null,
      p_error_stack: options?.error_stack || null
    })
  } catch (err) {
    console.error('Failed to log to github_ingestion_logs:', err)
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

  try {
    console.log('[GitHub Crawl Coordinator] Starting...')
    await logGitHubActivity(supabase, 'info', 'GitHub Crawl Coordinator starting')

    // Get pending crawl jobs
    const { data: pendingJobs, error: fetchError } = await supabase
      .from('github_crawl_queue')
      .select(`
        id,
        repository_id,
        crawl_type,
        priority,
        data,
        attempts,
        github_repositories!inner (
          id,
          full_name,
          owner,
          name,
          default_branch,
          private
        )
      `)
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString())
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(10)

    if (fetchError) {
      console.error('[GitHub Crawl Coordinator] Error fetching jobs:', fetchError)
      throw fetchError
    }

    if (!pendingJobs || pendingJobs.length === 0) {
      console.log('[GitHub Crawl Coordinator] No pending crawl jobs')
      await logGitHubActivity(supabase, 'info', 'No pending crawl jobs found')
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`[GitHub Crawl Coordinator] Found ${pendingJobs.length} pending jobs`)
    await logGitHubActivity(supabase, 'info', `Found ${pendingJobs.length} pending jobs`, {
      details: { job_count: pendingJobs.length }
    })

    const results = []
    let queuedCount = 0

    for (const job of pendingJobs) {
      try {
        // Get a GitHub token - either from job data or find a user with access
        let githubToken = job.data?.github_token

        if (!githubToken) {
          // Find a user with access to this repository
          const { data: userAccess } = await supabase
            .from('github_user_repos')
            .select('user_id')
            .eq('repository_id', job.repository_id)
            .order('last_seen_at', { ascending: false })
            .limit(1)
            .single()

          if (userAccess) {
            // Get their GitHub token
            const { data: tokenData } = await supabase.rpc('get_github_token', {
              user_id: userAccess.user_id
            })
            githubToken = tokenData
          }
        }

        if (!githubToken) {
          console.error(`[GitHub Crawl Coordinator] No GitHub token available for ${job.github_repositories.full_name}`)
          await logGitHubActivity(supabase, 'error', 'No GitHub token available', {
            job_id: job.id,
            repository_id: job.repository_id,
            repository_full_name: job.github_repositories.full_name,
            error_code: 'NO_TOKEN'
          })
          
          // Mark as failed
          await supabase
            .from('github_crawl_queue')
            .update({
              status: 'failed',
              error: 'No GitHub token available',
              completed_at: new Date().toISOString()
            })
            .eq('id', job.id)
          
          continue
        }

        // Prepare worker payload
        const workerPayload = {
          job_id: job.id,
          repository: {
            id: job.github_repositories.id,
            full_name: job.github_repositories.full_name,
            owner: job.github_repositories.owner,
            name: job.github_repositories.name,
            default_branch: job.github_repositories.default_branch,
            private: job.github_repositories.private
          },
          crawl_type: job.crawl_type,
          crawl_data: job.data,
          github_token: githubToken
        }

        // Send job to PGMQ queue for async processing
        const { data: sendResult, error: sendError } = await supabase.rpc('pgmq_send', {
          queue_name: 'github_crawl',
          msg: workerPayload
        })

        if (sendError) {
          throw sendError
        }

        // Mark job as queued
        const { error: updateError } = await supabase
          .from('github_crawl_queue')
          .update({
            status: 'queued',
            queued_at: new Date().toISOString(),
            attempts: job.attempts + 1
          })
          .eq('id', job.id)
          .eq('status', 'pending') // Ensure no race condition

        if (updateError) {
          console.error(`[GitHub Crawl Coordinator] Failed to mark job ${job.id} as queued:`, updateError)
          await logGitHubActivity(supabase, 'error', `Failed to mark job as queued`, {
            job_id: job.id,
            repository_id: job.repository_id,
            repository_full_name: job.github_repositories?.full_name,
            error_code: updateError.code,
            details: { error: updateError }
          })
          continue
        }

        queuedCount++
        results.push({
          job_id: job.id,
          repository: job.github_repositories.full_name,
          status: 'queued',
          pgmq_id: sendResult
        })

        console.log(`[GitHub Crawl Coordinator] Queued job ${job.id} for ${job.github_repositories.full_name} to PGMQ`)
        await logGitHubActivity(supabase, 'info', 'Queued job to PGMQ for async processing', {
          job_id: job.id,
          repository_id: job.repository_id,
          repository_full_name: job.github_repositories.full_name,
          details: { crawl_type: job.crawl_type, pgmq_id: sendResult }
        })

      } catch (error) {
        console.error(`[GitHub Crawl Coordinator] Error processing job ${job.id}:`, error)
        await logGitHubActivity(supabase, 'error', 'Error queueing job', {
          job_id: job.id,
          repository_id: job.repository_id,
          repository_full_name: job.github_repositories?.full_name,
          error_code: error.code || 'UNKNOWN',
          error_stack: error.stack,
          details: { error: String(error) }
        })
        
        results.push({
          job_id: job.id,
          repository: job.github_repositories?.full_name || 'unknown',
          status: 'error',
          error: error.message
        })
      }
    }

    // If we queued any jobs, spawn background workers to process them
    if (queuedCount > 0) {
      // Spawn workers as background tasks (fire and forget)
      const workerCount = Math.min(queuedCount, 3) // Max 3 workers
      for (let i = 0; i < workerCount; i++) {
        // Fire and forget - don't await
        fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/github-crawl-worker`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ batch_size: 5 })
        }).catch(err => {
          console.error(`[GitHub Crawl Coordinator] Failed to spawn worker ${i}:`, err)
        })
        
        console.log(`[GitHub Crawl Coordinator] Spawned background worker ${i}`)
      }
      
      await logGitHubActivity(supabase, 'info', `Spawned ${workerCount} background workers`, {
        details: { worker_count: workerCount, queued_jobs: queuedCount }
      })
    }

    return new Response(
      JSON.stringify({
        queued: queuedCount,
        workers_spawned: queuedCount > 0 ? Math.min(queuedCount, 3) : 0,
        results
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error('[GitHub Crawl Coordinator] Fatal error:', error)
    await logGitHubActivity(supabase, 'fatal', 'Fatal error in coordinator', {
      error_code: error.code || 'FATAL',
      error_stack: error.stack,
      details: { error: String(error) }
    })
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})