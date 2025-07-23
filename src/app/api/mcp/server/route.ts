import { NextRequest, NextResponse } from 'next/server'
import {
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js'
import { createServiceClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { createHash } from 'crypto'

// Tool schemas
const SearchKnowledgeSchema = z.object({
  query: z.string(),
  filters: z.object({
    projects: z.array(z.string()).optional(),
    users: z.array(z.string()).optional(),
    date_range: z.object({
      from: z.string().optional(),
      to: z.string().optional(),
    }).optional(),
    has_code: z.boolean().optional(),
    topics: z.array(z.string()).optional(),
  }).optional(),
  limit: z.number().min(1).max(100).default(10),
})

const GetCodeGraphSchema = z.object({
  repository: z.string(),
  branch: z.string().default('main'),
  entity_types: z.array(z.string()).optional(),
  include_relationships: z.boolean().default(true),
})

const TriggerRepoAnalysisSchema = z.object({
  repository: z.string(),
  branch: z.string().default('main'),
  full_analysis: z.boolean().default(false),
})

// Validate API key from Authorization header
async function validateApiKey(authHeader: string | null): Promise<{ teamId: string; userId?: string }> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new McpError(ErrorCode.InvalidRequest, 'Missing or invalid authorization header')
  }

  const apiKey = authHeader.slice(7) // Remove 'Bearer ' prefix
  const keyHash = createHash('sha256').update(apiKey).digest('hex')
  
  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from('api_keys')
    .select('team_id, user_id')
    .eq('key_hash', keyHash)
    .eq('is_active', true)
    .single()

  if (error || !data) {
    throw new McpError(ErrorCode.InvalidRequest, 'Invalid API key')
  }

  // Update last used timestamp
  await supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('key_hash', keyHash)

  return { teamId: data.team_id, userId: data.user_id }
}

// Tool definitions
const TOOLS = [
  {
    name: 'supastate_search_knowledge',
    description: 'Search across all team knowledge and conversations. Returns relevant memory chunks with context.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { 
          type: 'string', 
          description: 'Natural language search query' 
        },
        filters: {
          type: 'object',
          description: 'Optional filters to narrow search',
          properties: {
            projects: { 
              type: 'array', 
              items: { type: 'string' },
              description: 'Filter by project names'
            },
            users: { 
              type: 'array', 
              items: { type: 'string' },
              description: 'Filter by user IDs'
            },
            date_range: {
              type: 'object',
              properties: {
                from: { type: 'string', format: 'date-time' },
                to: { type: 'string', format: 'date-time' },
              },
              description: 'Filter by date range'
            },
            has_code: { 
              type: 'boolean',
              description: 'Only return memories containing code'
            },
            topics: { 
              type: 'array', 
              items: { type: 'string' },
              description: 'Filter by topics'
            },
          },
        },
        limit: { 
          type: 'number', 
          minimum: 1, 
          maximum: 100,
          description: 'Maximum results to return (default: 10)'
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'supastate_get_code_graph',
    description: 'Get the code graph for a repository, showing entities and their relationships',
    inputSchema: {
      type: 'object',
      properties: {
        repository: { 
          type: 'string', 
          description: 'Repository name in format owner/repo' 
        },
        branch: { 
          type: 'string', 
          description: 'Branch name (default: main)',
          default: 'main' 
        },
        entity_types: { 
          type: 'array', 
          items: { type: 'string' },
          description: 'Filter by entity types (function, class, interface, etc)'
        },
        include_relationships: { 
          type: 'boolean', 
          default: true,
          description: 'Include relationships between entities'
        },
      },
      required: ['repository'],
    },
  },
  {
    name: 'supastate_trigger_repo_analysis',
    description: 'Trigger analysis of a GitHub repository to update code graph',
    inputSchema: {
      type: 'object',
      properties: {
        repository: { 
          type: 'string', 
          description: 'Repository name in format owner/repo' 
        },
        branch: { 
          type: 'string', 
          description: 'Branch to analyze (default: main)',
          default: 'main' 
        },
        full_analysis: { 
          type: 'boolean', 
          default: false,
          description: 'Force full re-analysis even if recent analysis exists'
        },
      },
      required: ['repository'],
    },
  },
]

// Handle tool execution
async function executeTool(name: string, args: any, auth: { teamId: string; userId?: string }) {
  const supabase = await createServiceClient()

  switch (name) {
    case 'supastate_search_knowledge': {
      const params = SearchKnowledgeSchema.parse(args)
      
      const { data, error } = await supabase.rpc('search_memories_advanced', {
        p_team_id: auth.teamId,
        p_query: params.query,
        p_projects: params.filters?.projects,
        p_users: params.filters?.users,
        p_date_from: params.filters?.date_range?.from,
        p_date_to: params.filters?.date_range?.to,
        p_has_code: params.filters?.has_code,
        p_topics: params.filters?.topics,
        p_limit: params.limit,
      })

      if (error) throw error

      return {
        content: [
          {
            type: 'text',
            text: `Found ${data?.length || 0} results for "${params.query}":\n\n` +
              (data || []).map((m: any, i: number) => 
                `${i + 1}. [${m.project_name}] ${m.content.substring(0, 200)}...\n` +
                `   Relevance: ${(m.relevance * 100).toFixed(1)}%`
              ).join('\n\n')
          }
        ],
      }
    }

    case 'supastate_get_code_graph': {
      const params = GetCodeGraphSchema.parse(args)
      
      // Get repository state
      const { data: repoState } = await supabase
        .from('repository_states')
        .select('*')
        .eq('full_name', params.repository)
        .order('analyzed_at', { ascending: false })
        .limit(1)
        .single()

      if (!repoState) {
        return {
          content: [{
            type: 'text',
            text: `No code graph found for ${params.repository}. Use supastate_trigger_repo_analysis to analyze it first.`
          }],
        }
      }

      // Get entities
      let entityQuery = supabase
        .from('code_entities')
        .select('*')
        .eq('repository_state_id', repoState.id)
        .eq('is_source_truth', true)

      if (params.entity_types?.length) {
        entityQuery = entityQuery.in('entity_type', params.entity_types)
      }

      const { data: entities } = await entityQuery

      // Get relationships if requested
      let relationships = []
      if (params.include_relationships) {
        const { data: rels } = await supabase
          .from('code_relationships')
          .select('*')
          .eq('repository_state_id', repoState.id)
          .eq('is_source_truth', true)
        relationships = rels || []
      }

      return {
        content: [{
          type: 'text',
          text: `Code graph for ${params.repository} (${params.branch}):\n` +
            `- Entities: ${entities?.length || 0}\n` +
            `- Relationships: ${relationships.length}\n` +
            `- Last analyzed: ${new Date(repoState.analyzed_at).toLocaleString()}\n` +
            `- Languages: ${Object.keys(repoState.languages || {}).join(', ')}`
        }],
      }
    }

    case 'supastate_trigger_repo_analysis': {
      const params = TriggerRepoAnalysisSchema.parse(args)
      
      // Check if recent analysis exists
      if (!params.full_analysis) {
        const { data: existing } = await supabase
          .from('repository_states')
          .select('analyzed_at')
          .eq('full_name', params.repository)
          .gte('analyzed_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .single()

        if (existing) {
          return {
            content: [{
              type: 'text',
              text: `Repository ${params.repository} was analyzed recently (${new Date(existing.analyzed_at).toLocaleString()}). Use full_analysis: true to force re-analysis.`
            }],
          }
        }
      }

      // Create analysis job
      const { data: job, error } = await supabase
        .from('analysis_jobs')
        .insert({
          team_id: auth.teamId,
          repository: params.repository,
          branch: params.branch,
          status: 'pending',
          created_by: auth.userId,
        })
        .select()
        .single()

      if (error) throw error

      // Trigger async processing (would use orchestration service)
      // For now, just return the job info
      return {
        content: [{
          type: 'text',
          text: `Analysis job created for ${params.repository}:\n` +
            `- Job ID: ${job.id}\n` +
            `- Status: ${job.status}\n` +
            `- Branch: ${params.branch}\n\n` +
            `The analysis will run in the background. Check back later for results.`
        }],
      }
    }

    default:
      throw new McpError(
        ErrorCode.MethodNotFound,
        `Unknown tool: ${name}`
      )
  }
}

// Standard HTTP handler for MCP requests
export async function GET(request: NextRequest) {
  return NextResponse.json({
    name: 'supastate',
    version: '1.0.0',
    description: 'Supastate MCP server for code intelligence',
    protocol_version: '2024-11-05',
    capabilities: {
      tools: true,
    },
  })
}

// POST handler for MCP JSON-RPC requests
export async function POST(request: NextRequest) {
  try {
    // Validate API key
    const authHeader = request.headers.get('authorization')
    const auth = await validateApiKey(authHeader)
    
    // Parse request body
    const body = await request.json() as any
    
    // Handle the request based on the method
    if (body.method === 'tools/list') {
      return NextResponse.json({
        jsonrpc: '2.0',
        id: body.id,
        result: {
          tools: TOOLS,
        },
      })
    } else if (body.method === 'tools/call') {
      const { name, arguments: args } = body.params
      const result = await executeTool(name, args, auth)
      return NextResponse.json({
        jsonrpc: '2.0',
        id: body.id,
        result,
      })
    } else {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown method: ${body.method || 'undefined'}`)
    }
  } catch (error: any) {
    if (error instanceof McpError) {
      return NextResponse.json(
        {
          jsonrpc: '2.0',
          error: {
            code: error.code,
            message: error.message,
          },
        },
        {
          status: error.code === ErrorCode.InvalidRequest ? 401 : 400,
        }
      )
    }
    
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        error: {
          code: ErrorCode.InternalError,
          message: 'Internal server error',
        },
      },
      {
        status: 500,
      }
    )
  }
}

// Support OPTIONS for CORS
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}