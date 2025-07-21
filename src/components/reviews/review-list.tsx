'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { GitPullRequest, Clock, CheckCircle2, XCircle, AlertCircle, RefreshCw, ExternalLink, Users } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'

interface ReviewSession {
  id: string
  pr_url: string
  pr_number: number
  repository: string
  pr_metadata: any
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  created_at: string
  started_at: string | null
  completed_at: string | null
  review_agents: Array<{
    id: string
    agent_name: string
    agent_role: string
  }>
  creator: {
    email: string
    full_name: string | null
    avatar_url: string | null
  } | null
  result?: {
    verdict: 'approve' | 'request_changes' | 'comment'
    confidence: number
    summary: string
  }
}

interface ReviewListProps {
  sessions: ReviewSession[]
  loading: boolean
  onRefresh: () => void
}

const statusConfig = {
  pending: {
    icon: Clock,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50',
    label: 'Pending'
  },
  running: {
    icon: RefreshCw,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    label: 'Running',
    animate: true
  },
  completed: {
    icon: CheckCircle2,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    label: 'Completed'
  },
  failed: {
    icon: XCircle,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    label: 'Failed'
  },
  cancelled: {
    icon: AlertCircle,
    color: 'text-gray-600',
    bgColor: 'bg-gray-50',
    label: 'Cancelled'
  }
}

const verdictConfig = {
  approve: {
    color: 'text-green-700',
    bgColor: 'bg-green-100',
    borderColor: 'border-green-200',
    label: 'Approved'
  },
  request_changes: {
    color: 'text-red-700',
    bgColor: 'bg-red-100',
    borderColor: 'border-red-200',
    label: 'Changes Requested'
  },
  comment: {
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
    borderColor: 'border-blue-200',
    label: 'Comments'
  }
}

export function ReviewList({ sessions, loading, onRefresh }: ReviewListProps) {
  const router = useRouter()
  const [autoRefresh, setAutoRefresh] = useState(true)

  useEffect(() => {
    if (!autoRefresh) return

    // Auto-refresh every 5 seconds if there are running reviews
    const hasRunning = sessions.some(s => s.status === 'running')
    if (hasRunning) {
      const interval = setInterval(onRefresh, 5000)
      return () => clearInterval(interval)
    }
  }, [sessions, autoRefresh, onRefresh])

  if (loading && sessions.length === 0) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-4 w-[250px]" />
              <Skeleton className="h-4 w-[200px]" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <GitPullRequest className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No reviews yet</h3>
          <p className="text-muted-foreground">
            Create your first PR review to get started
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-muted-foreground">
          Showing {sessions.length} review{sessions.length !== 1 ? 's' : ''}
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          className="gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      {sessions.map((session) => {
        const config = statusConfig[session.status]
        const StatusIcon = config.icon
        const duration = session.completed_at && session.started_at
          ? new Date(session.completed_at).getTime() - new Date(session.started_at).getTime()
          : null

        return (
          <Card 
            key={session.id} 
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => router.push(`/reviews/${session.id}`)}
          >
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <GitPullRequest className="w-4 h-4" />
                    {session.repository} #{session.pr_number}
                  </CardTitle>
                  <CardDescription>
                    {session.pr_metadata?.title || 'Pull Request'}
                  </CardDescription>
                </div>
                
                <div className="flex items-center gap-2">
                  {session.result && (
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "gap-1",
                        verdictConfig[session.result.verdict].color,
                        verdictConfig[session.result.verdict].bgColor,
                        verdictConfig[session.result.verdict].borderColor
                      )}
                    >
                      {verdictConfig[session.result.verdict].label}
                      {session.result.confidence && (
                        <span className="text-xs opacity-70">
                          ({Math.round(session.result.confidence * 100)}%)
                        </span>
                      )}
                    </Badge>
                  )}
                  
                  <Badge 
                    variant="secondary"
                    className={cn(
                      "gap-1",
                      config.bgColor,
                      config.color
                    )}
                  >
                    <StatusIcon 
                      className={cn(
                        "w-3 h-3",
                        config.animate && "animate-spin"
                      )} 
                    />
                    {config.label}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatDistanceToNow(new Date(session.created_at), { addSuffix: true })}
                </div>
                
                {duration && (
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {Math.round(duration / 1000 / 60)}m duration
                  </div>
                )}
                
                <div className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {session.review_agents.length} agents
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {session.creator && (
                    <Avatar className="w-6 h-6">
                      <AvatarImage src={session.creator.avatar_url || undefined} />
                      <AvatarFallback>
                        {session.creator.full_name?.[0] || session.creator.email[0]}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <span className="text-sm text-muted-foreground">
                    {session.creator?.full_name || session.creator?.email || 'System'}
                  </span>
                </div>
                
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1"
                  onClick={(e) => {
                    e.stopPropagation()
                    window.open(session.pr_url, '_blank')
                  }}
                >
                  <ExternalLink className="w-3 h-3" />
                  View PR
                </Button>
              </div>

              {session.result?.summary && (
                <div className="pt-2 border-t">
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {session.result.summary}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}