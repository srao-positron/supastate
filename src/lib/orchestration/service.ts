import { createServiceClient } from '@/lib/supabase/server'
import { OrchestrationJob, OrchestrationEvent, OrchestrationService } from './types'
import { analyzeRepository } from './tasks/repo-analysis'
import { runPRReview } from './tasks/pr-review'

export class SupastateOrchestrationService implements OrchestrationService {
  private supabase: any

  constructor() {
    this.initialize()
  }

  private async initialize() {
    this.supabase = await createServiceClient()
  }

  async createJob(
    type: OrchestrationJob['type'],
    teamId: string,
    metadata: any,
    userId?: string
  ): Promise<OrchestrationJob> {
    const job: Partial<OrchestrationJob> = {
      type,
      team_id: teamId,
      created_by: userId,
      status: 'pending',
      metadata,
      progress: {
        current: 0,
        total: 100,
        message: 'Initializing...',
      },
      created_at: new Date(),
    }

    const { data, error } = await this.supabase
      .from('orchestration_jobs')
      .insert(job)
      .select()
      .single()

    if (error) throw error

    // Queue the job for processing
    this.processJob(data)

    return data
  }

  async getJob(jobId: string): Promise<OrchestrationJob | null> {
    const { data, error } = await this.supabase
      .from('orchestration_jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (error) return null
    return data
  }

  async cancelJob(jobId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('orchestration_jobs')
      .update({ 
        status: 'cancelled',
        completed_at: new Date(),
      })
      .eq('id', jobId)
      .in('status', ['pending', 'running'])

    return !error
  }

  subscribeToJob(
    jobId: string,
    onEvent: (event: OrchestrationEvent) => void
  ): () => void {
    const channel = this.supabase
      .channel(`job:${jobId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orchestration_events',
          filter: `job_id=eq.${jobId}`,
        },
        (payload: any) => {
          onEvent(payload.new)
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }

  private async processJob(job: OrchestrationJob) {
    try {
      // Update status to running
      await this.updateJobStatus(job.id, 'running', 'Starting job processing...')

      switch (job.type) {
        case 'repo_analysis':
          await this.processRepoAnalysis(job)
          break
        case 'pr_review':
          await this.processPRReview(job)
          break
        case 'pattern_analysis':
          await this.processPatternAnalysis(job)
          break
        default:
          throw new Error(`Unknown job type: ${job.type}`)
      }

      // Mark as completed
      await this.updateJobStatus(job.id, 'completed', 'Job completed successfully')
    } catch (error: any) {
      await this.updateJobStatus(
        job.id, 
        'failed', 
        `Job failed: ${error.message}`,
        error.message
      )
    }
  }

  private async processRepoAnalysis(job: OrchestrationJob) {
    const { repository, branch } = job.metadata
    
    // Log event
    await this.logEvent(job.id, 'status_update', {
      message: `Analyzing repository ${repository} on branch ${branch}`,
    })

    // Check if we have GitHub access
    const { data: repo } = await this.supabase
      .from('user_repositories')
      .select('*')
      .eq('full_name', repository)
      .single()

    if (!repo) {
      throw new Error('No access to repository. Please install GitHub App.')
    }

    // Run analysis (chunked for large repos)
    const result = await analyzeRepository({
      repository,
      branch,
      onProgress: async (progress) => {
        await this.updateProgress(job.id, progress)
      },
      onLog: async (message) => {
        await this.logEvent(job.id, 'log', { message })
      },
    })

    // Store result
    await this.supabase
      .from('orchestration_jobs')
      .update({ result })
      .eq('id', job.id)
  }

  private async processPRReview(job: OrchestrationJob) {
    const { pr_url, review_style } = job.metadata
    
    await this.logEvent(job.id, 'status_update', {
      message: `Starting ${review_style} review of ${pr_url}`,
    })

    // Run multi-agent review
    const result = await runPRReview({
      prUrl: pr_url,
      reviewStyle: review_style,
      onAgentUpdate: async (agentId, status) => {
        await this.logEvent(job.id, 'agent_update', { agentId, status })
      },
      onProgress: async (progress) => {
        await this.updateProgress(job.id, progress)
      },
    })

    // Store result
    await this.supabase
      .from('orchestration_jobs')
      .update({ result })
      .eq('id', job.id)
  }

  private async processPatternAnalysis(job: OrchestrationJob) {
    // Implementation for pattern analysis
    await this.logEvent(job.id, 'status_update', {
      message: 'Pattern analysis not yet implemented',
    })
  }

  private async updateJobStatus(
    jobId: string,
    status: OrchestrationJob['status'],
    message: string,
    error?: string
  ) {
    const update: any = {
      status,
      'progress.message': message,
    }

    if (status === 'running' && !update.started_at) {
      update.started_at = new Date()
    }

    if (status === 'completed' || status === 'failed') {
      update.completed_at = new Date()
    }

    if (error) {
      update.error = error
    }

    await this.supabase
      .from('orchestration_jobs')
      .update(update)
      .eq('id', jobId)

    await this.logEvent(jobId, 'status_update', { status, message })
  }

  private async updateProgress(
    jobId: string,
    progress: { current: number; total: number; message: string }
  ) {
    await this.supabase
      .from('orchestration_jobs')
      .update({ progress })
      .eq('id', jobId)

    await this.logEvent(jobId, 'progress', progress)
  }

  private async logEvent(jobId: string, type: string, content: any) {
    await this.supabase
      .from('orchestration_events')
      .insert({
        job_id: jobId,
        type,
        content,
        timestamp: new Date(),
      })
  }
}

// Singleton instance
let orchestrationService: SupastateOrchestrationService | null = null

export function getOrchestrationService(): SupastateOrchestrationService {
  if (!orchestrationService) {
    orchestrationService = new SupastateOrchestrationService()
  }
  return orchestrationService
}