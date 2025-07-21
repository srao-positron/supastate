'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { 
  GitPullRequest, 
  GitBranch, 
  GitCommit, 
  FileText, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  MessageSquare,
  Code,
  Shield,
  Zap,
  TestTube,
  Building
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'

interface ReviewSessionProps {
  session: any
  events: any[]
}

const statusConfig = {
  pending: {
    icon: Clock,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50',
    label: 'Pending',
    description: 'Review is queued and will start soon'
  },
  running: {
    icon: Clock,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    label: 'In Progress',
    description: 'Agents are analyzing the pull request',
    showProgress: true
  },
  completed: {
    icon: CheckCircle2,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    label: 'Completed',
    description: 'Review completed successfully'
  },
  failed: {
    icon: XCircle,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    label: 'Failed',
    description: 'Review encountered an error'
  },
  cancelled: {
    icon: AlertCircle,
    color: 'text-gray-600',
    bgColor: 'bg-gray-50',
    label: 'Cancelled',
    description: 'Review was cancelled'
  }
}

const agentIcons: Record<string, any> = {
  security: Shield,
  quality: Code,
  performance: Zap,
  testing: TestTube,
  architecture: Building
}

export function ReviewSession({ session, events }: ReviewSessionProps) {
  const [progress, setProgress] = useState(0)
  const [activeAgents, setActiveAgents] = useState<Set<string>>(new Set())
  
  const config = statusConfig[session.status]
  const StatusIcon = config.icon

  useEffect(() => {
    if (session.status !== 'running') return

    // Calculate progress based on events
    const totalAgents = session.review_agents.length
    const completedAgents = new Set(
      events
        .filter(e => e.event_type === 'final_verdict')
        .map(e => e.agent_id)
    ).size

    setProgress((completedAgents / totalAgents) * 100)

    // Track active agents
    const active = new Set(
      events
        .filter(e => e.event_type === 'agent_thought' || e.event_type === 'tool_call')
        .map(e => e.agent_id)
    )
    setActiveAgents(active)
  }, [events, session])

  // Group events by type for summary
  const eventSummary = events.reduce((acc, event) => {
    acc[event.event_type] = (acc[event.event_type] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // Extract findings and comments
  const findings = events.filter(e => 
    e.event_type === 'review_comment' || e.event_type === 'final_verdict'
  )

  const prMetadata = session.pr_metadata || {}

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                "p-2 rounded-lg",
                config.bgColor
              )}>
                <StatusIcon className={cn("w-5 h-5", config.color)} />
              </div>
              <div>
                <CardTitle>{config.label}</CardTitle>
                <CardDescription>{config.description}</CardDescription>
              </div>
            </div>
            
            <Badge variant="outline" className="text-xs">
              Session ID: {session.id.slice(0, 8)}
            </Badge>
          </div>
        </CardHeader>
        
        {config.showProgress && (
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Review Progress</span>
                <span className="text-muted-foreground">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-muted-foreground">
                  {activeAgents.size} agents actively analyzing
                </span>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* PR Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitPullRequest className="w-5 h-5" />
            Pull Request Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">
                  <span className="text-muted-foreground">From:</span> {prMetadata.head_ref || 'feature-branch'}
                  <span className="text-muted-foreground mx-2">→</span>
                  <span className="text-muted-foreground">To:</span> {prMetadata.base_ref || 'main'}
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <GitCommit className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">
                  {prMetadata.commits || 0} commits
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">
                  {prMetadata.changed_files || 0} files changed
                </span>
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">
                  Created {formatDistanceToNow(new Date(session.created_at), { addSuffix: true })}
                </span>
              </div>
              
              {session.started_at && (
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">
                    Started {formatDistanceToNow(new Date(session.started_at), { addSuffix: true })}
                  </span>
                </div>
              )}
              
              {session.completed_at && (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">
                    Completed in {
                      Math.round(
                        (new Date(session.completed_at).getTime() - 
                         new Date(session.started_at || session.created_at).getTime()) / 1000 / 60
                      )
                    } minutes
                  </span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Review Results */}
      {session.result && (
        <Card>
          <CardHeader>
            <CardTitle>Review Result</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Badge 
                  variant={
                    session.result.verdict === 'approve' ? 'default' :
                    session.result.verdict === 'request_changes' ? 'destructive' :
                    'secondary'
                  }
                  className="text-sm py-1 px-3"
                >
                  {session.result.verdict === 'approve' ? 'Approved' :
                   session.result.verdict === 'request_changes' ? 'Changes Requested' :
                   'Comments'}
                </Badge>
                
                {session.result.confidence && (
                  <span className="text-sm text-muted-foreground">
                    Confidence: {Math.round(session.result.confidence * 100)}%
                  </span>
                )}
              </div>
              
              {session.result.summary && (
                <Alert>
                  <AlertTitle>Summary</AlertTitle>
                  <AlertDescription>
                    {session.result.summary}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Findings & Comments */}
      {findings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Findings & Comments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              <div className="space-y-4">
                {findings.map((finding, index) => {
                  const agent = session.review_agents.find((a: any) => a.id === finding.agent_id)
                  const AgentIcon = agentIcons[agent?.agent_role] || MessageSquare
                  
                  return (
                    <div key={finding.id} className="border rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <AgentIcon className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium text-sm">
                            {agent?.agent_name || 'Unknown Agent'}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(finding.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      
                      {finding.event_type === 'final_verdict' && finding.content.verdict && (
                        <Badge 
                          variant={
                            finding.content.verdict === 'approve' ? 'default' :
                            finding.content.verdict === 'request_changes' ? 'destructive' :
                            'secondary'
                          }
                          className="text-xs"
                        >
                          {finding.content.verdict}
                        </Badge>
                      )}
                      
                      <p className="text-sm text-muted-foreground">
                        {finding.content.message || finding.content.comment || finding.content.summary}
                      </p>
                      
                      {finding.content.file_path && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <FileText className="w-3 h-3" />
                          <code>{finding.content.file_path}</code>
                          {finding.content.line_number && (
                            <span>:L{finding.content.line_number}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Event Statistics */}
      <Card>
        <CardHeader>
          <CardTitle>Activity Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{eventSummary.tool_call || 0}</div>
              <div className="text-xs text-muted-foreground">Tool Calls</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{eventSummary.agent_thought || 0}</div>
              <div className="text-xs text-muted-foreground">Agent Thoughts</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{eventSummary.discussion_turn || 0}</div>
              <div className="text-xs text-muted-foreground">Discussions</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{eventSummary.review_comment || 0}</div>
              <div className="text-xs text-muted-foreground">Comments</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}