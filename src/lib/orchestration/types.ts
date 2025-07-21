export interface OrchestrationJob {
  id: string
  type: 'repo_analysis' | 'pr_review' | 'pattern_analysis'
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  team_id: string
  created_by?: string
  metadata: {
    repository?: string
    branch?: string
    pr_url?: string
    pattern_type?: string
    [key: string]: any
  }
  progress: {
    current: number
    total: number
    message: string
  }
  result?: any
  error?: string
  created_at: Date
  started_at?: Date
  completed_at?: Date
}

export interface OrchestrationEvent {
  id: string
  job_id: string
  type: 'status_update' | 'progress' | 'result' | 'error' | 'log'
  content: any
  timestamp: Date
}

export interface RepoAnalysisConfig {
  repository: string
  branch: string
  full_analysis: boolean
  include_tests: boolean
  languages?: string[]
}

export interface PRReviewConfig {
  pr_url: string
  review_style: 'thorough' | 'quick' | 'security-focused'
  agents?: {
    name: string
    role: string
    prompt: string
  }[]
}

export interface OrchestrationService {
  createJob(
    type: OrchestrationJob['type'],
    teamId: string,
    metadata: any,
    userId?: string
  ): Promise<OrchestrationJob>
  
  getJob(jobId: string): Promise<OrchestrationJob | null>
  
  cancelJob(jobId: string): Promise<boolean>
  
  // Event streaming
  subscribeToJob(
    jobId: string,
    onEvent: (event: OrchestrationEvent) => void
  ): () => void
}