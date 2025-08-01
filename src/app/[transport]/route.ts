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
  const openAIKey = process.env.OPENAI_API_KEY
  if (!openAIKey) {
    throw new Error('OpenAI API key not configured')
  }

  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'text-embedding-3-large',
        input: text,
        dimensions: 3072
      })
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('OpenAI API error:', error)
      throw new Error(`OpenAI API error: ${response.status}`)
    }

    const data = await response.json()
    return data.data[0].embedding
  } catch (error) {
    console.error('Failed to generate embedding:', error)
    throw new Error('Failed to generate embedding')
  }
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
  
  // Log all incoming requests from Claude for debugging
  const debugInfo: any = {
    method: request.method,
    url: request.url,
    pathname: new URL(request.url).pathname,
    headers: Object.fromEntries(request.headers.entries()),
    hasAuth: !!authHeader,
    authType: authHeader ? authHeader.substring(0, 20) + '...' : 'none'
  }
  
  // Try to log body for POST requests
  if (request.method === 'POST') {
    try {
      const clonedRequest = request.clone()
      const body = await clonedRequest.text()
      debugInfo.body = body
      debugInfo.bodyLength = body.length
    } catch (e) {
      debugInfo.bodyError = 'Could not read body'
    }
  }
  
  console.error('[MCP Debug] Incoming request:', debugInfo)
  
  // Check if this is a capabilities request
  const url = new URL(request.url)
  const isCapabilities = url.pathname.endsWith('/capabilities')
  
  // For non-capabilities requests, require authentication
  if (!isCapabilities && (!authHeader || !authHeader.startsWith('Bearer '))) {
    const responseHeaders = {
      'Content-Type': 'application/json',
      'WWW-Authenticate': `Bearer resource_metadata=${baseUrl}/.well-known/oauth-protected-resource`,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }
    
    console.error('[MCP Debug] Sending 401 response:', {
      status: 401,
      headers: responseHeaders,
      body: {
        error: 'unauthorized',
        error_description: 'Authentication required',
      }
    })
    
    return new NextResponse(
      JSON.stringify({
        error: 'unauthorized',
        error_description: 'Authentication required',
      }),
      {
        status: 401,
        headers: responseHeaders,
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
  
  console.error('[MCP Debug] Authentication successful:', {
    userId,
    workspaceId,
    isCapabilities
  })
  
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

            // Since Neo4j doesn't support multi-label vector indexes,
            // we need to query each index separately and combine results
            let cypherQuery = ''
            
            if (!params.types || params.types.length === 0) {
              // Query all types
              cypherQuery = `
                CALL {
                  CALL db.index.vector.queryNodes('memory_embeddings', $limit, $embedding)
                  YIELD node as n, score
                  WHERE ${ownershipFilter}
                  RETURN n, score
                  UNION
                  CALL db.index.vector.queryNodes('code_embeddings', $limit, $embedding)
                  YIELD node as n, score
                  WHERE ${ownershipFilter}
                  RETURN n, score
                }
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
            } else {
              // Query specific types
              const unionParts = []
              if (params.types.includes('memory')) {
                unionParts.push(`
                  CALL db.index.vector.queryNodes('memory_embeddings', $limit, $embedding)
                  YIELD node as n, score
                  WHERE ${ownershipFilter}
                  RETURN n, score
                `)
              }
              if (params.types.includes('code')) {
                unionParts.push(`
                  CALL db.index.vector.queryNodes('code_embeddings', $limit, $embedding)
                  YIELD node as n, score
                  WHERE ${ownershipFilter}
                  RETURN n, score
                `)
              }
              
              if (unionParts.length > 0) {
                cypherQuery = `
                  CALL {
                    ${unionParts.join(' UNION ')}
                  }
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
              } else {
                // No valid types, return empty
                return {
                  content: [{
                    type: "text",
                    text: JSON.stringify({
                      results: [],
                      query: params.query,
                      totalResults: 0,
                    }, null, 2),
                  }],
                }
              }
            }

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
        "searchCode",
        "Search code with language-specific understanding",
        {
          query: z.string().describe('Code pattern or natural language'),
          language: z.string().optional().describe('Filter by programming language'),
          project: z.string().optional().describe('Filter by project name'),
          includeTests: z.boolean().optional().default(false),
          includeImports: z.boolean().optional().default(true),
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
              nodeAlias: 'c',
            })

            let additionalFilters = ''
            if (params.language) {
              additionalFilters += ` AND c.language = $language`
            }
            if (params.project) {
              additionalFilters += ` AND c.project_name = $project`
            }
            if (!params.includeTests) {
              additionalFilters += ` AND NOT c.file_path CONTAINS 'test'`
            }

            const cypherQuery = `
              CALL db.index.vector.queryNodes('code_embeddings', 30, $embedding)
              YIELD node as c, score
              WHERE c:CodeEntity AND ${ownershipFilter} ${additionalFilters}
              WITH c, score
              ORDER BY score DESC
              LIMIT 20
              RETURN 
                c.id as id,
                c.name as name,
                c.type as entityType,
                c.file_path as filePath,
                c.language as language,
                c.content as content,
                c.summary as summary,
                c.metadata as metadata,
                score
            `

            const embedding = await getEmbedding(params.query)
            const result = await session.run(cypherQuery, {
              embedding,
              language: params.language,
              project: params.project,
            })

            const results = result.records.map((record: any) => ({
              id: record.get('id'),
              name: record.get('name'),
              type: record.get('entityType'),
              filePath: record.get('filePath'),
              language: record.get('language'),
              content: record.get('content'),
              summary: record.get('summary'),
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
                      language: params.language,
                      project: params.project,
                      includeTests: params.includeTests,
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

      server.tool(
        "exploreRelationships",
        "Find connections between entities in the knowledge graph",
        {
          entityUri: z.string().describe('Starting entity URI'),
          relationshipTypes: z.array(z.string()).optional(),
          depth: z.number().max(3).optional().default(2),
          direction: z.enum(['in', 'out', 'both']).optional().default('both'),
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
            const [entityType, ...idParts] = params.entityUri.split('://')
            const entityId = idParts.join('://')

            const ownershipFilter = getOwnershipFilter({
              userId,
              workspaceId,
              nodeAlias: 'n',
            })

            let relationshipFilter = ''
            if (params.relationshipTypes && params.relationshipTypes.length > 0) {
              relationshipFilter = `[r:${params.relationshipTypes.join('|')}]`
            } else {
              relationshipFilter = '[r]'
            }

            let directionQuery = ''
            switch (params.direction) {
              case 'out':
                directionQuery = `(start)-${relationshipFilter}->(end)`
                break
              case 'in':
                directionQuery = `(start)<-${relationshipFilter}-(end)`
                break
              case 'both':
              default:
                directionQuery = `(start)-${relationshipFilter}-(end)`
                break
            }

            const cypherQuery = `
              MATCH (start {id: $entityId})
              WHERE ${ownershipFilter.replace('n.', 'start.')}
              MATCH path = ${directionQuery}
              WHERE ${ownershipFilter.replace('n.', 'end.')}
                AND length(path) <= $depth
              RETURN DISTINCT
                start.id as startId,
                start.name as startName,
                labels(start) as startLabels,
                type(r) as relationshipType,
                end.id as endId,
                end.name as endName,
                labels(end) as endLabels,
                length(path) as distance
              ORDER BY distance, relationshipType
              LIMIT 50
            `

            const result = await session.run(cypherQuery, {
              entityId,
              depth: params.depth || 2,
            })

            const relationships = result.records.map((record: any) => ({
              source: {
                id: record.get('startId'),
                name: record.get('startName'),
                type: inferTypeFromLabels(record.get('startLabels')),
              },
              relationship: record.get('relationshipType'),
              target: {
                id: record.get('endId'),
                name: record.get('endName'),
                type: inferTypeFromLabels(record.get('endLabels')),
              },
              distance: record.get('distance'),
            }))

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    entityUri: params.entityUri,
                    relationships,
                    totalRelationships: relationships.length,
                    maxDepth: params.depth,
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
        "inspectEntity",
        "Get comprehensive details about any entity",
        {
          uri: z.string().describe('Entity URI to inspect'),
          includeRelationships: z.boolean().optional().default(true),
          includeContent: z.boolean().optional().default(true),
          includeSimilar: z.boolean().optional().default(false),
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
            const [entityType, ...idParts] = params.uri.split('://')
            const entityId = idParts.join('://')

            const ownershipFilter = getOwnershipFilter({
              userId,
              workspaceId,
              nodeAlias: 'n',
            })

            // Get entity details
            const entityQuery = `
              MATCH (n {id: $entityId})
              WHERE ${ownershipFilter}
              RETURN n, labels(n) as labels
            `

            const entityResult = await session.run(entityQuery, { entityId })
            
            if (entityResult.records.length === 0) {
              throw new Error('Entity not found or access denied')
            }

            const entityRecord = entityResult.records[0]
            const entity = entityRecord.get('n').properties
            const labels = entityRecord.get('labels')

            let relationships: any[] = []
            if (params.includeRelationships) {
              const relQuery = `
                MATCH (n {id: $entityId})-[r]-(m)
                WHERE ${ownershipFilter} AND ${ownershipFilter.replace('n.', 'm.')}
                RETURN type(r) as type, 
                       m.id as targetId, 
                       m.name as targetName,
                       labels(m) as targetLabels,
                       startNode(r).id = n.id as isOutgoing
                LIMIT 20
              `

              const relResult = await session.run(relQuery, { entityId })
              relationships = relResult.records.map((record: any) => ({
                type: record.get('type'),
                direction: record.get('isOutgoing') ? 'outgoing' : 'incoming',
                target: {
                  id: record.get('targetId'),
                  name: record.get('targetName'),
                  type: inferTypeFromLabels(record.get('targetLabels')),
                },
              }))
            }

            let similar: any[] = []
            if (params.includeSimilar && entity.embedding) {
              const indexName = labels.includes('CodeEntity') ? 'code_embeddings' : 
                               labels.includes('Memory') ? 'memory_embeddings' : 
                               null
              
              if (indexName) {
                const similarQuery = `
                  MATCH (n {id: $entityId})
                  WHERE ${ownershipFilter}
                  CALL db.index.vector.queryNodes($indexName, 10, n.embedding)
                  YIELD node as s, score
                  WHERE s.id <> n.id AND ${ownershipFilter.replace('n.', 's.')}
                  RETURN s.id as id, s.name as name, labels(s) as labels, score
                  LIMIT 5
                `

                const simResult = await session.run(similarQuery, { entityId, indexName })
                similar = simResult.records.map((record: any) => ({
                  id: record.get('id'),
                  name: record.get('name'),
                  type: inferTypeFromLabels(record.get('labels')),
                  similarity: record.get('score'),
                }))
              }
            }

            // Clean up entity properties for output
            const cleanEntity = { ...entity }
            const embedding = cleanEntity.embedding
            delete cleanEntity.embedding // Remove large embedding from output
            if (!params.includeContent) {
              delete cleanEntity.content
            }

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    uri: params.uri,
                    type: inferTypeFromLabels(labels),
                    entity: {
                      ...cleanEntity,
                      hasEmbedding: !!embedding,
                    },
                    relationships: params.includeRelationships ? relationships : undefined,
                    similar: params.includeSimilar ? similar : undefined,
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
          searchCode: {
            description: "Search code with language-specific understanding",
          },
          searchMemories: {
            description: "Search development conversations and decisions",
          },
          exploreRelationships: {
            description: "Navigate the knowledge graph",
          },
          inspectEntity: {
            description: "Get detailed information about any entity",
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