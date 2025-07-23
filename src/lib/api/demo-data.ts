// Demo data generator for PR Review Dashboard
export function generateDemoReviewSession() {
  const statuses = ['pending', 'running', 'completed', 'failed', 'cancelled'] as const
  const repositories = [
    'facebook/react',
    'vercel/next.js',
    'microsoft/vscode',
    'nodejs/node',
    'rust-lang/rust'
  ]
  
  const titles = [
    'Fix memory leak in useEffect cleanup',
    'Add support for RSC in app directory',
    'Improve TypeScript performance',
    'Update dependencies to latest versions',
    'Refactor authentication middleware',
    'Add dark mode support',
    'Fix race condition in async handler',
    'Optimize bundle size for production'
  ]
  
  const verdicts = ['approve', 'request_changes', 'comment'] as const
  
  const randomStatus = statuses[Math.floor(Math.random() * statuses.length)]
  const randomRepo = repositories[Math.floor(Math.random() * repositories.length)]
  const randomTitle = titles[Math.floor(Math.random() * titles.length)]
  
  const createdAt = new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000)
  const startedAt = randomStatus !== 'pending' 
    ? new Date(createdAt.getTime() + Math.random() * 30 * 60 * 1000)
    : null
  const completedAt = ['completed', 'failed', 'cancelled'].includes(randomStatus) && startedAt
    ? new Date(startedAt.getTime() + Math.random() * 60 * 60 * 1000)
    : null
    
  return {
    id: crypto.randomUUID(),
    pr_url: `https://github.com/${randomRepo}/pull/${Math.floor(Math.random() * 1000) + 1}`,
    pr_number: Math.floor(Math.random() * 1000) + 1,
    repository: randomRepo,
    pr_metadata: {
      title: randomTitle,
      author: 'demo-user',
      commits: Math.floor(Math.random() * 10) + 1,
      changed_files: Math.floor(Math.random() * 20) + 1,
      additions: Math.floor(Math.random() * 500) + 10,
      deletions: Math.floor(Math.random() * 300) + 5
    },
    status: randomStatus,
    created_at: createdAt.toISOString(),
    started_at: startedAt?.toISOString() || null,
    completed_at: completedAt?.toISOString() || null,
    review_agents: generateDemoAgents(),
    creator: {
      id: 'demo-user-id',
      email: 'demo@example.com',
      full_name: 'Demo User',
      avatar_url: null
    },
    result: randomStatus === 'completed' ? {
      verdict: verdicts[Math.floor(Math.random() * verdicts.length)],
      confidence: 0.7 + Math.random() * 0.3,
      summary: 'The code changes look good overall. All tests pass and the implementation follows best practices.'
    } : undefined
  }
}

export function generateDemoAgents() {
  const agents = [
    {
      id: crypto.randomUUID(),
      agent_name: 'Security Auditor',
      agent_role: 'security',
      model: 'gpt-4-turbo-preview'
    },
    {
      id: crypto.randomUUID(),
      agent_name: 'Code Quality Analyst',
      agent_role: 'quality',
      model: 'gpt-4-turbo-preview'
    },
    {
      id: crypto.randomUUID(),
      agent_name: 'Performance Engineer',
      agent_role: 'performance',
      model: 'gpt-4-turbo-preview'
    },
    {
      id: crypto.randomUUID(),
      agent_name: 'Test Coverage Expert',
      agent_role: 'testing',
      model: 'gpt-4-turbo-preview'
    },
    {
      id: crypto.randomUUID(),
      agent_name: 'Architecture Guardian',
      agent_role: 'architecture',
      model: 'gpt-4-turbo-preview'
    }
  ]
  
  // Return a random subset of agents
  const count = Math.floor(Math.random() * 3) + 2
  return agents.sort(() => Math.random() - 0.5).slice(0, count)
}

export function generateDemoEvents(agents: any[], status: string) {
  const events: any[] = []
  const eventTypes = [
    'status_update',
    'tool_call',
    'tool_result',
    'agent_thought',
    'discussion_turn',
    'review_comment',
    'final_verdict'
  ]
  
  // Generate some events for each agent
  agents.forEach(agent => {
    const eventCount = Math.floor(Math.random() * 5) + 3
    
    for (let i = 0; i < eventCount; i++) {
      const eventType = eventTypes[Math.floor(Math.random() * (eventTypes.length - 1))]
      
      events.push({
        id: crypto.randomUUID(),
        session_id: 'demo-session',
        agent_id: agent.id,
        event_type: eventType,
        content: generateEventContent(eventType, agent),
        created_at: new Date(Date.now() - Math.random() * 60 * 60 * 1000).toISOString(),
        agent: {
          agent_name: agent.agent_name,
          agent_role: agent.agent_role
        }
      })
    }
    
    // Add final verdict if completed
    if (status === 'completed') {
      events.push({
        id: crypto.randomUUID(),
        session_id: 'demo-session',
        agent_id: agent.id,
        event_type: 'final_verdict',
        content: {
          verdict: ['approve', 'request_changes', 'comment'][Math.floor(Math.random() * 3)],
          confidence: 0.7 + Math.random() * 0.3,
          summary: `${agent.agent_name} has completed the review.`
        },
        created_at: new Date(Date.now() - Math.random() * 30 * 60 * 1000).toISOString(),
        agent: {
          agent_name: agent.agent_name,
          agent_role: agent.agent_role
        }
      })
    }
  })
  
  return events.sort((a, b) => 
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
}

function generateEventContent(eventType: string, agent: any) {
  switch (eventType) {
    case 'tool_call':
      return {
        tool: ['analyze_code', 'check_dependencies', 'run_tests', 'scan_vulnerabilities'][Math.floor(Math.random() * 4)],
        args: { file: 'src/example.ts' }
      }
    case 'agent_thought':
      return {
        thought: `${agent.agent_name} is analyzing the code changes...`
      }
    case 'discussion_turn':
      return {
        message: 'I noticed a potential issue with the error handling in this function.'
      }
    case 'review_comment':
      return {
        file_path: 'src/components/Example.tsx',
        line_number: Math.floor(Math.random() * 100) + 1,
        comment: 'Consider adding error boundary here for better error handling.'
      }
    default:
      return { message: 'Processing...' }
  }
}

export function generateDemoMetrics() {
  return {
    totalReviews: Math.floor(Math.random() * 100) + 50,
    completedReviews: Math.floor(Math.random() * 80) + 30,
    failedReviews: Math.floor(Math.random() * 10) + 2,
    activeReviews: Math.floor(Math.random() * 5) + 1,
    averageDuration: Math.floor(Math.random() * 30) + 15
  }
}