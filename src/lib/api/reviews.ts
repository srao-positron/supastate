import { createBrowserClient } from '@/lib/supabase/client'
import { Database } from '@/types/database'

type ReviewSession = Database['public']['Tables']['review_sessions']['Row']
type ReviewAgent = Database['public']['Tables']['review_agents']['Row']
type ReviewEvent = Database['public']['Tables']['review_events']['Row']

export interface ReviewFilters {
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  repository?: string
  startDate?: Date
  endDate?: Date
}

export interface ReviewMetrics {
  totalReviews: number
  completedReviews: number
  failedReviews: number
  averageDuration: number
  activeReviews: number
}

export async function getReviewSessions(teamId: string, filters?: ReviewFilters) {
  const supabase = createBrowserClient()
  
  let query = supabase
    .from('review_sessions')
    .select(`
      *,
      review_agents (
        id,
        agent_name,
        agent_role,
        model
      ),
      creator:users!review_sessions_created_by_fkey (
        id,
        email,
        full_name,
        avatar_url
      )
    `)
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
  
  if (filters?.status) {
    query = query.eq('status', filters.status)
  }
  
  if (filters?.repository) {
    query = query.eq('repository', filters.repository)
  }
  
  if (filters?.startDate) {
    query = query.gte('created_at', filters.startDate.toISOString())
  }
  
  if (filters?.endDate) {
    query = query.lte('created_at', filters.endDate.toISOString())
  }
  
  const { data, error } = await query
  
  if (error) throw error
  return data
}

export async function getReviewSession(sessionId: string) {
  const supabase = createBrowserClient()
  
  const { data, error } = await supabase
    .from('review_sessions')
    .select(`
      *,
      review_agents (
        id,
        agent_name,
        agent_role,
        agent_prompt,
        model,
        created_at
      ),
      creator:users!review_sessions_created_by_fkey (
        id,
        email,
        full_name,
        avatar_url
      )
    `)
    .eq('id', sessionId)
    .single()
  
  if (error) throw error
  return data
}

export async function getReviewEvents(sessionId: string, limit = 100) {
  const supabase = createBrowserClient()
  
  const { data, error } = await supabase
    .from('review_events')
    .select(`
      *,
      agent:review_agents (
        id,
        agent_name,
        agent_role
      )
    `)
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(limit)
  
  if (error) throw error
  return data
}

export async function subscribeToReviewEvents(
  sessionId: string,
  onEvent: (event: ReviewEvent) => void
) {
  const supabase = createBrowserClient()
  
  const channel = supabase
    .channel(`review-events:${sessionId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'review_events',
        filter: `session_id=eq.${sessionId}`
      },
      (payload) => {
        onEvent(payload.new as ReviewEvent)
      }
    )
    .subscribe()
  
  return () => {
    supabase.removeChannel(channel)
  }
}

export async function subscribeToSessionUpdates(
  sessionId: string,
  onUpdate: (session: ReviewSession) => void
) {
  const supabase = createBrowserClient()
  
  const channel = supabase
    .channel(`review-session:${sessionId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'review_sessions',
        filter: `id=eq.${sessionId}`
      },
      (payload) => {
        onUpdate(payload.new as ReviewSession)
      }
    )
    .subscribe()
  
  return () => {
    supabase.removeChannel(channel)
  }
}

export async function getReviewMetrics(teamId: string): Promise<ReviewMetrics> {
  const supabase = createBrowserClient()
  
  const { data: sessions, error } = await supabase
    .from('review_sessions')
    .select('status, created_at, completed_at')
    .eq('team_id', teamId)
  
  if (error) throw error
  
  const metrics: ReviewMetrics = {
    totalReviews: sessions.length,
    completedReviews: sessions.filter(s => s.status === 'completed').length,
    failedReviews: sessions.filter(s => s.status === 'failed').length,
    activeReviews: sessions.filter(s => s.status === 'running').length,
    averageDuration: 0
  }
  
  // Calculate average duration for completed reviews
  const completedWithTime = sessions.filter(
    s => s.status === 'completed' && s.completed_at && s.created_at
  )
  
  if (completedWithTime.length > 0) {
    const totalDuration = completedWithTime.reduce((sum, s) => {
      const start = new Date(s.created_at).getTime()
      const end = new Date(s.completed_at!).getTime()
      return sum + (end - start)
    }, 0)
    
    metrics.averageDuration = Math.round(totalDuration / completedWithTime.length / 1000 / 60) // in minutes
  }
  
  return metrics
}

export async function getRepositories(teamId: string): Promise<string[]> {
  const supabase = createBrowserClient()
  
  const { data, error } = await supabase
    .from('review_sessions')
    .select('repository')
    .eq('team_id', teamId)
    .order('repository')
  
  if (error) throw error
  
  // Get unique repositories
  const uniqueRepos = Array.from(new Set(data.map(d => d.repository)))
  return uniqueRepos
}

export async function triggerManualReview(
  teamId: string,
  prUrl: string,
  config?: {
    style?: 'thorough' | 'quick' | 'security-focused'
    autoMergeOnApproval?: boolean
  }
) {
  const supabase = createBrowserClient()
  const { data: { session } } = await supabase.auth.getSession()
  
  const response = await fetch('/api/reviews/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token}`
    },
    body: JSON.stringify({
      teamId,
      prUrl,
      reviewConfig: config
    })
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to create review')
  }
  
  return response.json()
}

export async function cancelReview(sessionId: string) {
  const supabase = createBrowserClient()
  
  const { error } = await supabase
    .from('review_sessions')
    .update({
      status: 'cancelled',
      completed_at: new Date().toISOString()
    })
    .eq('id', sessionId)
  
  if (error) throw error
}

export async function getAgentStatistics(teamId: string) {
  const supabase = createBrowserClient()
  
  const { data, error } = await supabase
    .from('review_agents')
    .select(`
      agent_name,
      agent_role,
      review_sessions!inner(
        team_id,
        status
      )
    `)
    .eq('review_sessions.team_id', teamId)
  
  if (error) throw error
  
  // Calculate statistics per agent
  const agentStats: Record<string, {
    name: string
    role: string
    totalReviews: number
    completedReviews: number
  }> = {}
  
  data.forEach(agent => {
    const key = `${agent.agent_name}-${agent.agent_role}`
    if (!agentStats[key]) {
      agentStats[key] = {
        name: agent.agent_name,
        role: agent.agent_role,
        totalReviews: 0,
        completedReviews: 0
      }
    }
    agentStats[key].totalReviews++
    if (agent.review_sessions && agent.review_sessions.length > 0 && agent.review_sessions[0].status === 'completed') {
      agentStats[key].completedReviews++
    }
  })
  
  return Object.values(agentStats)
}