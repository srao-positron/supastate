import { createMcpHandler } from "@vercel/mcp-adapter"
import { z } from "zod"
import { createServiceClient } from '@/lib/supabase/service'
import neo4j from 'neo4j-driver'
import { getOwnershipFilter } from '@/lib/neo4j/query-patterns'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { jwtVerify } from 'jose'

// Ensure Redis is configured for MCP adapter
const redisUrl = process.env.REDIS_URL || process.env.KV_URL
if (!redisUrl) {
  console.error('Redis URL not found. MCP adapter requires Redis for state management.')
}

async function getEmbedding(text: string): Promise<number[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.functions.invoke('generate-embeddings', {
    body: { texts: [text] },
  })

  if (error || !data?.embeddings?.[0]) {
    throw new Error('Failed to generate embedding')
  }

  return data.embeddings[0]
}

function inferTypeFromLabels(labels: string[]): string {
  if (labels.includes('CodeEntity')) return 'code'
  if (labels.includes('Memory')) return 'memory'
  if (labels.includes('GitHubEntity')) return 'github'
  return 'unknown'
}

// OAuth handler wrapper
async function handleMcpRequest(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.supastate.ai'
  
  // Check if this is a capabilities request
  const url = new URL(request.url)
  const isCapabilities = url.pathname.endsWith('/capabilities')
  
  // For non-capabilities requests, require authentication
  if (!isCapabilities && (!authHeader || !authHeader.startsWith('Bearer '))) {
    return new NextResponse(
      JSON.stringify({
        error: 'unauthorized',
        error_description: 'Authentication required',
      }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'WWW-Authenticate': `Bearer resource_metadata=${baseUrl}/.well-known/oauth-protected-resource`,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      }
    )
  }
  
  // If we have an auth header, validate it
  let userId: string | undefined
  let workspaceId: string | undefined
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    
    try {
      // First try to validate as our MCP token
      const mcpTokenSecret = new TextEncoder().encode(
        process.env.MCP_TOKEN_SECRET || 'mcp-token-secret-change-in-production'
      )
      
      try {
        const { payload } = await jwtVerify(token, mcpTokenSecret)
        
        // Extract user info from MCP token
        userId = payload.sub as string
        workspaceId = payload.workspace_id as string
        
      } catch (mcpError) {
        // If MCP token validation fails, try Supabase token as fallback
        // This allows both token types during transition
        const supabase = await createClient()
        const { data: { user }, error } = await supabase.auth.getUser(token)
        
        if (error || !user) {
          return new NextResponse(
            JSON.stringify({
              error: 'unauthorized',
              error_description: 'Invalid or expired token'
            }),
            {
              status: 401,
              headers: {
                'Content-Type': 'application/json',
                'WWW-Authenticate': `Bearer resource_metadata=${baseUrl}/.well-known/oauth-protected-resource, error="invalid_token", error_description="Invalid or expired token"`,
                'Access-Control-Allow-Origin': '*',
              },
            }
          )
        }
        
        // Get workspace info for Supabase token
        const { data: userRecord } = await supabase
          .from('users')
          .select('id, team_id')
          .eq('id', user.id)
          .single()
        
        userId = user.id
        workspaceId = userRecord?.team_id ? `team:${userRecord.team_id}` : `user:${user.id}`
      }
    } catch (e) {
      console.error('Token validation error:', e)
      // If token validation fails, return 401
      return new NextResponse(
        JSON.stringify({
          error: 'unauthorized',
          error_description: 'Token validation failed'
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'WWW-Authenticate': `Bearer resource_metadata=${baseUrl}/.well-known/oauth-protected-resource, error="invalid_token", error_description="Token validation failed"`,
            'Access-Control-Allow-Origin': '*',
          },
        }
      )
    }
  }
  
  // Create the MCP handler with auth context
  const handler = createMcpHandler(
    async (server) => {
      // Register tools with auth context
      server.tool(
        "search",
        "Search across code, memories, and GitHub data using natural language",
        {
          query: z.string().describe('Natural language search query'),
          types: z.array(z.enum(['code', 'memory', 'github'])).optional().describe('Filter by entity types'),
          limit: z.number().optional().default(20).describe('Maximum results'),
          workspace: z.string().optional().describe('Specific workspace filter'),
        },
        async (params) => {
          // Require auth for tool invocation
          if (!userId || !workspaceId) {
            throw new Error('Authentication required')
          }
          
          // Initialize Neo4j for this request
          const neo4jDriver = neo4j.driver(
            process.env.NEO4J_URI!,
            neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
          )
          
          const session = neo4jDriver.session()
          try {
            const ownershipFilter = getOwnershipFilter({
              userId,
              workspaceId,
              nodeAlias: 'n',
            })

            let typeFilter = ''
            if (params.types && params.types.length > 0) {
              const labels = params.types.map(t => {
                switch (t) {
                  case 'code': return 'CodeEntity'
                  case 'memory': return 'Memory'
                  case 'github': return 'GitHubEntity'
                  default: return ''
                }
              }).filter(Boolean)
              
              if (labels.length > 0) {
                typeFilter = `AND (${labels.map(l => `n:${l}`).join(' OR ')})`
              }
            }

            const cypherQuery = `
              CALL db.index.vector.queryNodes('unified_embeddings', $limit + 10, $embedding)
              YIELD node as n, score
              WHERE ${ownershipFilter} ${typeFilter}
              WITH n, score
              ORDER BY score DESC
              LIMIT $limit
              RETURN 
                n.id as id,
                n.name as name,
                n.type as type,
                n.content as content,
                n.summary as summary,
                n.file_path as filePath,
                n.project_name as projectName,
                labels(n) as labels,
                score
            `

            const embedding = await getEmbedding(params.query)
            const result = await session.run(cypherQuery, {
              embedding,
              limit: params.limit || 20,
            })

            const results = result.records.map((record: any) => ({
              id: record.get('id'),
              name: record.get('name'),
              type: inferTypeFromLabels(record.get('labels')),
              content: record.get('content'),
              summary: record.get('summary'),
              filePath: record.get('filePath'),
              projectName: record.get('projectName'),
              score: record.get('score'),
            }))

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    results,
                    query: params.query,
                    totalResults: results.length,
                  }, null, 2),
                },
              ],
            }
          } finally {
            await session.close()
            await neo4jDriver.close()
          }
        }
      )

      server.tool(
        "searchMemories",
        "Search development conversations and decisions",
        {
          query: z.string().describe('Natural language query'),
          dateRange: z.object({
            start: z.string().optional(),
            end: z.string().optional(),
          }).optional(),
          projects: z.array(z.string()).optional(),
        },
        async (params) => {
          if (!userId || !workspaceId) {
            throw new Error('Authentication required')
          }
          
          const neo4jDriver = neo4j.driver(
            process.env.NEO4J_URI!,
            neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
          )
          
          const session = neo4jDriver.session()
          try {
            const ownershipFilter = getOwnershipFilter({
              userId,
              workspaceId,
              nodeAlias: 'm',
            })

            let dateFilter = ''
            if (params.dateRange) {
              if (params.dateRange.start) {
                dateFilter += ` AND m.occurred_at >= datetime($startDate)`
              }
              if (params.dateRange.end) {
                dateFilter += ` AND m.occurred_at <= datetime($endDate)`
              }
            }

            let projectFilter = ''
            if (params.projects && params.projects.length > 0) {
              projectFilter = ` AND m.project_name IN $projects`
            }

            const cypherQuery = `
              CALL db.index.vector.queryNodes('memory_embeddings', 30, $embedding)
              YIELD node as m, score
              WHERE m:Memory AND ${ownershipFilter} ${dateFilter} ${projectFilter}
              WITH m, score
              ORDER BY score DESC
              LIMIT 20
              RETURN 
                m.id as id,
                m.session_id as sessionId,
                m.chunk_id as chunkId,
                m.content as content,
                m.summary as summary,
                m.occurred_at as occurredAt,
                m.project_name as projectName,
                m.metadata as metadata,
                score
            `

            const embedding = await getEmbedding(params.query)
            const result = await session.run(cypherQuery, {
              embedding,
              startDate: params.dateRange?.start,
              endDate: params.dateRange?.end,
              projects: params.projects,
            })

            const results = result.records.map((record: any) => ({
              id: record.get('id'),
              sessionId: record.get('sessionId'),
              chunkId: record.get('chunkId'),
              content: record.get('content'),
              summary: record.get('summary'),
              occurredAt: record.get('occurredAt'),
              projectName: record.get('projectName'),
              metadata: record.get('metadata'),
              score: record.get('score'),
            }))

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    results,
                    query: params.query,
                    filters: {
                      dateRange: params.dateRange,
                      projects: params.projects,
                    },
                  }, null, 2),
                },
              ],
            }
          } finally {
            await session.close()
            await neo4jDriver.close()
          }
        }
      )
    },
    {
      capabilities: {
        tools: {
          search: {
            description: "Search across code, memories, and GitHub data",
          },
          searchMemories: {
            description: "Search development conversations and decisions",
          },
        },
      },
    },
    {
      basePath: "",
      verboseLogs: true,
      maxDuration: 60,
      redisUrl,
    }
  )
  
  return handler(request)
}

// Export route handlers
export async function GET(request: NextRequest) {
  return handleMcpRequest(request)
}

export async function POST(request: NextRequest) {
  return handleMcpRequest(request)
}

export async function DELETE(request: NextRequest) {
  return handleMcpRequest(request)
}

// Handle OPTIONS for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}