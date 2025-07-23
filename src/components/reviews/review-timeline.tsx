'use client'

import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { 
  Activity,
  MessageSquare,
  Wrench,
  Brain,
  CheckCircle2,
  AlertCircle,
  FileSearch,
  GitBranch,
  Code,
  Shield,
  Zap,
  TestTube,
  Building
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'

interface ReviewEvent {
  id: string
  event_type: string
  content: any
  created_at: string
  agent?: {
    agent_name: string
    agent_role: string
  }
}

interface ReviewTimelineProps {
  events: ReviewEvent[]
}

const eventTypeConfig = {
  status_update: {
    icon: Activity,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    label: 'Status Update'
  },
  tool_call: {
    icon: Wrench,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    label: 'Tool Usage'
  },
  tool_result: {
    icon: FileSearch,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    label: 'Tool Result'
  },
  thinking: {
    icon: Brain,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50',
    label: 'Thinking'
  },
  agent_thought: {
    icon: Brain,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50',
    label: 'Agent Thought'
  },
  discussion_turn: {
    icon: MessageSquare,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    label: 'Discussion'
  },
  review_comment: {
    icon: MessageSquare,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    label: 'Review Comment'
  },
  final_verdict: {
    icon: CheckCircle2,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    label: 'Final Verdict'
  },
  error: {
    icon: AlertCircle,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    label: 'Error'
  }
}

const agentRoleIcons: Record<string, any> = {
  security: Shield,
  quality: Code,
  performance: Zap,
  testing: TestTube,
  architecture: Building
}

export function ReviewTimeline({ events }: ReviewTimelineProps) {
  if (events.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No events yet</p>
      </div>
    )
  }

  return (
    <ScrollArea className="h-[500px] pr-4">
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-border" />
        
        {/* Events */}
        <div className="space-y-4">
          {events.map((event, index) => {
            const config = eventTypeConfig[event.event_type as keyof typeof eventTypeConfig] || {
              icon: Activity,
              color: 'text-gray-600',
              bgColor: 'bg-gray-50',
              label: event.event_type
            }
            const Icon = config.icon
            const AgentIcon = event.agent ? (agentRoleIcons[event.agent.agent_role] || Brain) : null
            
            return (
              <div key={event.id} className="relative flex gap-4">
                {/* Icon */}
                <div className={cn(
                  "relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 border-background",
                  config.bgColor
                )}>
                  <Icon className={cn("h-4 w-4", config.color)} />
                </div>
                
                {/* Content */}
                <div className="flex-1 space-y-2 pb-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{config.label}</span>
                        {event.agent && (
                          <>
                            <span className="text-muted-foreground">•</span>
                            <div className="flex items-center gap-1">
                              {AgentIcon && <AgentIcon className="w-3 h-3 text-muted-foreground" />}
                              <span className="text-sm text-muted-foreground">
                                {event.agent.agent_name}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                      
                      {/* Event-specific content */}
                      <div className="text-sm text-muted-foreground">
                        {event.event_type === 'tool_call' && event.content.tool && (
                          <p>Called <code className="text-xs bg-muted px-1 py-0.5 rounded">{event.content.tool}</code></p>
                        )}
                        
                        {event.event_type === 'agent_thought' && event.content.thought && (
                          <p className="line-clamp-2">{event.content.thought}</p>
                        )}
                        
                        {event.event_type === 'discussion_turn' && event.content.message && (
                          <p className="line-clamp-2">{event.content.message}</p>
                        )}
                        
                        {event.event_type === 'review_comment' && (
                          <div>
                            {event.content.file_path && (
                              <p className="font-mono text-xs mb-1">
                                {event.content.file_path}
                                {event.content.line_number && `:L${event.content.line_number}`}
                              </p>
                            )}
                            <p className="line-clamp-2">{event.content.comment || event.content.message}</p>
                          </div>
                        )}
                        
                        {event.event_type === 'final_verdict' && (
                          <div className="flex items-center gap-2">
                            <Badge 
                              variant={
                                event.content.verdict === 'approve' ? 'default' :
                                event.content.verdict === 'request_changes' ? 'destructive' :
                                'secondary'
                              }
                              className="text-xs"
                            >
                              {event.content.verdict === 'approve' ? 'Approved' :
                               event.content.verdict === 'request_changes' ? 'Changes Requested' :
                               'Comments'}
                            </Badge>
                            {event.content.confidence && (
                              <span className="text-xs">
                                ({Math.round(event.content.confidence * 100)}% confident)
                              </span>
                            )}
                          </div>
                        )}
                        
                        {event.event_type === 'error' && (
                          <p className="text-red-600">{event.content.error || 'An error occurred'}</p>
                        )}
                        
                        {event.event_type === 'status_update' && event.content.status && (
                          <p>Status changed to <Badge variant="outline" className="text-xs">{event.content.status}</Badge></p>
                        )}
                      </div>
                    </div>
                    
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </ScrollArea>
  )
}