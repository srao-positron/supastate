import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { z } from 'zod'

const CreateReviewSchema = z.object({
  teamId: z.string().uuid(),
  prUrl: z.string().url(),
  reviewConfig: z.object({
    style: z.enum(['thorough', 'quick', 'security-focused']).default('thorough'),
    autoMergeOnApproval: z.boolean().default(false),
    customAgents: z.array(z.object({
      name: z.string(),
      role: z.string(),
      prompt: z.string(),
    })).optional(),
  }).optional(),
})

export async function POST(request: NextRequest) {
  try {
    // Auth check - support both API key and bearer token
    const apiKey = request.headers.get('x-api-key')
    const bearerToken = request.headers.get('authorization')?.replace('Bearer ', '')
    
    if (!apiKey && !bearerToken) {
      return NextResponse.json({ error: 'Missing authentication' }, { status: 401 })
    }

    // Parse request
    const body = await request.json()
    const { teamId, prUrl, reviewConfig } = CreateReviewSchema.parse(body)

    // Parse PR URL
    const prMatch = prUrl.match(/github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/)
    if (!prMatch) {
      return NextResponse.json({ 
        error: 'Invalid GitHub PR URL' 
      }, { status: 400 })
    }
    const [, owner, repo, prNumber] = prMatch

    // Initialize Supabase
    const supabase = await createServiceClient()

    let userId: string | null = null

    // Verify authentication
    if (apiKey) {
      // API key authentication
      const { data: apiKeyData, error: apiKeyError } = await supabase
        .from('api_keys')
        .select('team_id, user_id')
        .eq('key_hash', apiKey)
        .eq('is_active', true)
        .single()

      if (apiKeyError || apiKeyData?.team_id !== teamId) {
        return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
      }
      userId = apiKeyData.user_id
    } else if (bearerToken) {
      // Bearer token authentication
      const { data: { user }, error } = await supabase.auth.getUser(bearerToken)
      if (error || !user) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
      }
      
      // Verify user belongs to the team
      const { data: teamMember } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('user_id', user.id)
        .eq('team_id', teamId)
        .single()
      
      if (!teamMember) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
      }
      userId = user.id
    }

    // Create review session
    const { data: session, error: sessionError } = await supabase
      .from('review_sessions')
      .insert({
        team_id: teamId,
        pr_url: prUrl,
        pr_number: parseInt(prNumber),
        repository: `${owner}/${repo}`,
        pr_metadata: {
          owner,
          repo,
          number: parseInt(prNumber),
        },
        status: 'pending',
        created_by: userId,
      })
      .select()
      .single()

    if (sessionError) {
      console.error('Session creation error:', sessionError)
      return NextResponse.json({ 
        error: 'Failed to create review session' 
      }, { status: 500 })
    }

    // Create default agents based on style
    const agents = getDefaultAgents(reviewConfig?.style || 'thorough')
    const customAgents = reviewConfig?.customAgents || []
    const allAgents = [...agents, ...customAgents]

    // Insert agents
    const { error: agentsError } = await supabase
      .from('review_agents')
      .insert(
        allAgents.map(agent => ({
          session_id: session.id,
          agent_name: agent.name,
          agent_role: agent.role,
          agent_prompt: agent.prompt,
        }))
      )

    if (agentsError) {
      console.error('Agents creation error:', agentsError)
    }

    // Queue the review for processing
    // In production, this would trigger a serverless function or queue job
    await triggerReviewOrchestration(session.id, teamId)

    return NextResponse.json({
      sessionId: session.id,
      status: 'pending',
      agents: allAgents.map(a => ({ name: a.name, role: a.role })),
      streamUrl: `/api/reviews/${session.id}/events`,
    })
  } catch (error) {
    console.error('Review creation error:', error)
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}

function getDefaultAgents(style: string) {
  const baseAgents = [
    {
      name: 'Security Auditor',
      role: 'security',
      prompt: 'You are a security expert. Review this PR for vulnerabilities, authentication issues, injection risks, and exposed secrets.',
    },
    {
      name: 'Code Quality Analyst',
      role: 'quality',
      prompt: 'You are a code quality expert. Review for code style, readability, maintainability, and best practices.',
    },
  ]

  if (style === 'thorough') {
    return [
      ...baseAgents,
      {
        name: 'Performance Engineer',
        role: 'performance',
        prompt: 'You are a performance expert. Look for inefficient algorithms, database queries, and resource usage.',
      },
      {
        name: 'Architecture Guardian',
        role: 'architecture',
        prompt: 'You are a software architect. Ensure the changes follow architectural patterns and don\'t introduce technical debt.',
      },
      {
        name: 'Test Coverage Expert',
        role: 'testing',
        prompt: 'You are a testing expert. Verify adequate test coverage and suggest missing test cases.',
      },
    ]
  } else if (style === 'security-focused') {
    return [
      baseAgents[0], // Security Auditor
      {
        name: 'OWASP Specialist',
        role: 'owasp',
        prompt: 'You are an OWASP expert. Check for OWASP Top 10 vulnerabilities and security misconfigurations.',
      },
      {
        name: 'Compliance Officer',
        role: 'compliance',
        prompt: 'You are a compliance expert. Ensure the code meets regulatory requirements and data protection standards.',
      },
    ]
  }

  return baseAgents
}

async function triggerReviewOrchestration(sessionId: string, teamId: string) {
  // In production, this would trigger a serverless function
  // For now, we'll just update the status
  const supabase = await createServiceClient()
  await supabase
    .from('review_sessions')
    .update({ 
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
}