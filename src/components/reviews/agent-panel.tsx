'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { 
  Bot, 
  Shield, 
  Code, 
  Zap, 
  TestTube, 
  Building,
  MessageSquare,
  CheckCircle2,
  Clock,
  Activity,
  Brain
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Agent {
  id: string
  agent_name: string
  agent_role: string
  agent_prompt: string
  model: string
}

interface AgentPanelProps {
  agents: Agent[]
  events: any[]
}

const roleIcons: Record<string, any> = {
  security: Shield,
  quality: Code,
  performance: Zap,
  testing: TestTube,
  architecture: Building,
  owasp: Shield,
  compliance: Shield
}

const roleColors: Record<string, string> = {
  security: 'text-red-600 bg-red-50',
  quality: 'text-blue-600 bg-blue-50',
  performance: 'text-orange-600 bg-orange-50',
  testing: 'text-green-600 bg-green-50',
  architecture: 'text-purple-600 bg-purple-50',
  owasp: 'text-red-600 bg-red-50',
  compliance: 'text-indigo-600 bg-indigo-50'
}

export function AgentPanel({ agents, events }: AgentPanelProps) {
  const [agentStates, setAgentStates] = useState<Record<string, {
    status: 'idle' | 'thinking' | 'analyzing' | 'completed'
    lastAction: string
    progress: number
    eventCount: number
  }>>({})

  useEffect(() => {
    // Calculate agent states based on events
    const states: typeof agentStates = {}
    
    agents.forEach(agent => {
      const agentEvents = events.filter(e => e.agent_id === agent.id)
      const lastEvent = agentEvents[agentEvents.length - 1]
      const hasVerdict = agentEvents.some(e => e.event_type === 'final_verdict')
      
      let status: 'idle' | 'thinking' | 'analyzing' | 'completed' = 'idle'
      let lastAction = 'Waiting to start'
      
      if (hasVerdict) {
        status = 'completed'
        lastAction = 'Review completed'
      } else if (lastEvent) {
        switch (lastEvent.event_type) {
          case 'agent_thought':
            status = 'thinking'
            lastAction = 'Processing information'
            break
          case 'tool_call':
            status = 'analyzing'
            lastAction = `Using ${lastEvent.content.tool || 'tool'}`
            break
          case 'discussion_turn':
            status = 'thinking'
            lastAction = 'Discussing with other agents'
            break
          default:
            if (agentEvents.length > 0) {
              status = 'analyzing'
              lastAction = 'Analyzing code'
            }
        }
      }
      
      states[agent.id] = {
        status,
        lastAction,
        progress: hasVerdict ? 100 : Math.min(90, agentEvents.length * 10),
        eventCount: agentEvents.length
      }
    })
    
    setAgentStates(states)
  }, [agents, events])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="w-5 h-5" />
          Review Agents
        </CardTitle>
        <CardDescription>
          {agents.length} specialized agents analyzing the code
        </CardDescription>
      </CardHeader>
      <CardContent>
        <TooltipProvider>
          <div className="space-y-4">
            {agents.map(agent => {
              const RoleIcon = roleIcons[agent.agent_role] || Brain
              const state = agentStates[agent.id] || {
                status: 'idle',
                lastAction: 'Initializing',
                progress: 0,
                eventCount: 0
              }
              
              return (
                <div 
                  key={agent.id}
                  className="border rounded-lg p-4 space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "p-2 rounded-lg",
                        roleColors[agent.agent_role] || 'text-gray-600 bg-gray-50'
                      )}>
                        <RoleIcon className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-medium text-sm">{agent.agent_name}</h4>
                        <p className="text-xs text-muted-foreground capitalize">
                          {agent.agent_role} specialist
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {state.status === 'completed' ? (
                        <Badge variant="default" className="text-xs gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Done
                        </Badge>
                      ) : state.status === 'thinking' || state.status === 'analyzing' ? (
                        <Badge variant="secondary" className="text-xs gap-1">
                          <Activity className="w-3 h-3 animate-pulse" />
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs gap-1">
                          <Clock className="w-3 h-3" />
                          Idle
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="space-y-1">
                        <Progress value={state.progress} className="h-1.5" />
                        <p className="text-xs text-muted-foreground">
                          {state.lastAction}
                        </p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">{state.eventCount} events processed</p>
                    </TooltipContent>
                  </Tooltip>
                  
                  {/* Agent stats */}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>Model: {agent.model}</span>
                    <span>•</span>
                    <span>{state.eventCount} actions</span>
                  </div>
                </div>
              )
            })}
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  )
}