import { createMcpHandler } from "@vercel/mcp-adapter"
import { z } from "zod"
import { createServiceClient } from '@/lib/supabase/service'
import neo4j from 'neo4j-driver'
import { getOwnershipFilter, getOwnershipParams } from '@/lib/neo4j/query-patterns'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { jwtVerify } from 'jose'
import { TOOL_DESCRIPTIONS, getCapabilitiesDescription } from '@/lib/mcp/tool-descriptions'

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
        TOOL_DESCRIPTIONS.search.name,
        TOOL_DESCRIPTIONS.search.description,
        {
          query: z.string().describe('Natural language search query'),
          types: z.array(z.enum(['code', 'memory', 'github'])).optional().describe('Filter by entity types'),
          limit: z.number().optional().default(10).describe('Maximum results (default: 10)'),
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
                // Search through EntitySummary nodes
                CALL db.index.vector.queryNodes('entity_summary_embeddings', toInteger($limit) * 2, $embedding)
                YIELD node as s, score
                WHERE s:EntitySummary AND ${ownershipFilter.replace(/n\./g, 's.')}
                
                // Get the actual entity
                MATCH (s)-[:SUMMARIZES]->(n)
                WHERE (n:Memory OR n:CodeEntity) AND ${ownershipFilter}
                
                WITH n, s, score
                ORDER BY score DESC
                LIMIT toInteger($limit)
                RETURN 
                  n.id as id,
                  COALESCE(n.name, n.path, n.title) as name,
                  n.type as type,
                  n.content as content,
                  COALESCE(s.summary, n.summary) as summary,
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
                  // Search EntitySummary for memories
                  CALL db.index.vector.queryNodes('entity_summary_embeddings', toInteger($limit), $embedding)
                  YIELD node as s, score
                  WHERE s:EntitySummary AND ${ownershipFilter.replace(/n\./g, 's.')}
                  MATCH (s)-[:SUMMARIZES]->(n:Memory)
                  WHERE ${ownershipFilter}
                  RETURN n, s, score
                `)
              }
              if (params.types.includes('code')) {
                unionParts.push(`
                  // Search EntitySummary for code
                  CALL db.index.vector.queryNodes('entity_summary_embeddings', toInteger($limit), $embedding)
                  YIELD node as s, score
                  WHERE s:EntitySummary AND ${ownershipFilter.replace(/n\./g, 's.')}
                  MATCH (s)-[:SUMMARIZES]->(n:CodeEntity)
                  WHERE ${ownershipFilter}
                  RETURN n, s, score
                `)
              }
              
              if (unionParts.length > 0) {
                cypherQuery = `
                  CALL {
                    ${unionParts.join(' UNION ')}
                  }
                  WITH n, s, score
                  ORDER BY score DESC
                  LIMIT toInteger($limit)
                  RETURN 
                    n.id as id,
                    COALESCE(n.name, n.path, n.title) as name,
                    n.type as type,
                    n.content as content,
                    COALESCE(s.summary, n.summary) as summary,
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
            const ownershipParams = getOwnershipParams({
              userId,
              workspaceId,
            })
            const result = await session.run(cypherQuery, {
              ...ownershipParams,
              embedding,
              limit: neo4j.int(params.limit || 10),
            })

            const results = result.records.map((record: any) => {
              const type = inferTypeFromLabels(record.get('labels'))
              const id = record.get('id')
              return {
                id: `${type}:${id}`, // Return full URI format
                name: record.get('name'),
                type,
                content: record.get('content'),
                summary: record.get('summary'),
                filePath: record.get('filePath'),
                projectName: record.get('projectName'),
                score: record.get('score'),
              }
            })

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
        TOOL_DESCRIPTIONS.searchCode.name,
        TOOL_DESCRIPTIONS.searchCode.description,
        {
          query: z.string().describe('Code pattern or natural language'),
          language: z.string().optional().describe('Filter by programming language'),
          project: z.string().optional().describe('Filter by project name'),
          includeTests: z.boolean().optional().default(false).describe('Include test files in results'),
          includeImports: z.boolean().optional().default(true).describe('Include import relationships'),
          limit: z.number().optional().default(20).describe('Maximum results to return (default: 20)'),
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
              // Search through EntitySummary nodes (which have embeddings)
              CALL db.index.vector.queryNodes('entity_summary_embeddings', toInteger($limit) * 2, $embedding)
              YIELD node as s, score
              WHERE s:EntitySummary AND ${ownershipFilter.replace(/c\./g, 's.')}
              
              // Get the actual CodeEntity
              MATCH (s)-[:SUMMARIZES]->(c:CodeEntity)
              WHERE ${ownershipFilter} ${additionalFilters}
              
              WITH c, s, score
              ORDER BY score DESC
              LIMIT toInteger($limit)
              RETURN 
                c.id as id,
                COALESCE(c.name, c.path) as name,
                c.type as entityType,
                c.file_path as filePath,
                c.language as language,
                c.content as content,
                COALESCE(s.summary, c.summary) as summary,
                c.metadata as metadata,
                score
            `

            const embedding = await getEmbedding(params.query)
            const ownershipParams = getOwnershipParams({
              userId,
              workspaceId,
            })
            const result = await session.run(cypherQuery, {
              ...ownershipParams,
              embedding,
              language: params.language,
              project: params.project,
              limit: neo4j.int(params.limit || 20),
            })

            console.error('[searchCode] Query returned', result.records.length, 'results for query:', params.query)
            console.error('[searchCode] Ownership params:', ownershipParams)

            const results = result.records.map((record: any) => ({
              id: `code:${record.get('id')}`, // Return full URI format
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
        TOOL_DESCRIPTIONS.searchMemories.name,
        TOOL_DESCRIPTIONS.searchMemories.description,
        {
          query: z.string().describe('Natural language query'),
          dateRange: z.object({
            start: z.string().optional().describe('ISO date string for range start'),
            end: z.string().optional().describe('ISO date string for range end'),
          }).optional().describe('Filter results by date range'),
          projects: z.array(z.string()).optional().describe('Filter by project names'),
          limit: z.number().optional().default(20).describe('Maximum results to return (default: 20)'),
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
              // Search through EntitySummary nodes (which have embeddings)
              CALL db.index.vector.queryNodes('entity_summary_embeddings', toInteger($limit) * 2, $embedding)
              YIELD node as s, score
              WHERE s:EntitySummary AND ${ownershipFilter.replace(/m\./g, 's.')}
              
              // Get the actual Memory
              MATCH (s)-[:SUMMARIZES]->(m:Memory)
              WHERE ${ownershipFilter} ${dateFilter} ${projectFilter}
              
              WITH m, s, score
              ORDER BY score DESC
              LIMIT toInteger($limit)
              RETURN 
                m.id as id,
                m.session_id as sessionId,
                m.chunk_id as chunkId,
                m.content as content,
                COALESCE(s.summary, m.summary) as summary,
                m.occurred_at as occurredAt,
                m.project_name as projectName,
                m.metadata as metadata,
                score
            `

            const embedding = await getEmbedding(params.query)
            const ownershipParams = getOwnershipParams({
              userId,
              workspaceId,
            })
            const result = await session.run(cypherQuery, {
              ...ownershipParams,
              embedding,
              startDate: params.dateRange?.start,
              endDate: params.dateRange?.end,
              projects: params.projects,
              limit: neo4j.int(params.limit || 20),
            })

            const results = result.records.map((record: any) => ({
              id: `memory:${record.get('id')}`, // Return full URI format
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
        TOOL_DESCRIPTIONS.exploreRelationships.name,
        TOOL_DESCRIPTIONS.exploreRelationships.description,
        {
          entityUri: z.string().describe('Starting entity URI (from search result id field)'),
          relationshipTypes: z.array(z.string()).optional().describe('Filter by specific relationship types (e.g., IMPORTS, CALLS, REFERENCES)'),
          depth: z.number().max(3).optional().default(2).describe('How many hops to traverse (default: 2, max: 3)'),
          direction: z.enum(['in', 'out', 'both']).optional().default('both').describe('Direction to traverse: in (dependents), out (dependencies), both'),
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
            const colonIndex = params.entityUri.indexOf(':')
            if (colonIndex === -1) {
              throw new Error('Invalid URI format. Expected format: type:id (e.g., memory:uuid, code:uuid)')
            }
            const entityType = params.entityUri.substring(0, colonIndex)
            const entityId = params.entityUri.substring(colonIndex + 1)

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

            // Get separate ownership filters for start and end nodes
            const startOwnershipFilter = getOwnershipFilter({
              userId,
              workspaceId,
              nodeAlias: 'start',
            })
            const endOwnershipFilter = getOwnershipFilter({
              userId,
              workspaceId,
              nodeAlias: 'end',
            })

            const cypherQuery = `
              MATCH (start {id: $entityId})
              WHERE ${startOwnershipFilter}
              MATCH path = ${directionQuery}
              WHERE ${endOwnershipFilter}
                AND length(path) <= $depth
              RETURN DISTINCT
                start.id as startId,
                COALESCE(start.name, start.path, start.id) as startName,
                labels(start) as startLabels,
                type(r) as relationshipType,
                end.id as endId,
                COALESCE(end.name, end.path, end.id) as endName,
                labels(end) as endLabels,
                length(path) as distance
              ORDER BY distance, relationshipType
              LIMIT 50
            `

            const ownershipParams = getOwnershipParams({
              userId,
              workspaceId,
            })
            const result = await session.run(cypherQuery, {
              ...ownershipParams,
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
        TOOL_DESCRIPTIONS.getRelatedItems.name,
        TOOL_DESCRIPTIONS.getRelatedItems.description,
        {
          entityUri: z.string().describe('Entity URI to find related items for'),
          types: z.array(z.enum(['code', 'memory', 'pattern'])).optional().describe('Filter by entity types'),
          relationshipTypes: z.array(z.string()).optional().describe('Filter by specific relationship types'),
          includeSimilar: z.boolean().optional().default(true).describe('Include semantically similar items'),
          similarityThreshold: z.number().min(0).max(1).optional().default(0.7).describe('Minimum similarity score'),
          limit: z.number().optional().default(20).describe('Maximum results to return'),
          cursor: z.string().optional().describe('Pagination cursor from previous response'),
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
            const colonIndex = params.entityUri.indexOf(':')
            if (colonIndex === -1) {
              throw new Error('Invalid URI format. Expected format: type:id (e.g., memory:uuid, code:uuid)')
            }
            const entityType = params.entityUri.substring(0, colonIndex)
            const entityId = params.entityUri.substring(colonIndex + 1)
            
            const ownershipFilter = getOwnershipFilter({
              userId,
              workspaceId,
              nodeAlias: 'n',
            })
            
            // Parse cursor for pagination
            const offset = params.cursor ? 
              JSON.parse(Buffer.from(params.cursor, 'base64').toString()).offset : 0
            
            // Build type filter
            let typeFilter = ''
            if (params.types && params.types.length > 0) {
              const labels = params.types.map(t => {
                switch (t) {
                  case 'code': return 'CodeEntity'
                  case 'memory': return 'Memory'
                  case 'pattern': return 'Pattern'
                  default: return ''
                }
              }).filter(Boolean)
              typeFilter = `AND (${labels.map(l => `related:${l}`).join(' OR ')})`
            }
            
            // Build relationship filter
            let relFilter = ''
            if (params.relationshipTypes && params.relationshipTypes.length > 0) {
              relFilter = `AND type(r) IN $relationshipTypes`
            }
            
            // Get direct relationships
            const relQuery = `
              MATCH (n {id: $entityId})
              WHERE ${ownershipFilter}
              MATCH (n)-[r]-(related)
              WHERE ${ownershipFilter.replace('n.', 'related.')} ${typeFilter} ${relFilter}
              WITH type(r) as relType, related, 
                   CASE WHEN startNode(r).id = n.id THEN 'outgoing' ELSE 'incoming' END as direction
              RETURN 
                related.id as id,
                labels(related)[0] as type,
                relType as relationship,
                direction,
                related.name as name,
                related.title as title,
                related.file_path as filePath,
                related.project_name as projectName,
                substring(COALESCE(related.content, related.summary, ''), 0, 200) as snippet,
                related as fullEntity
              ORDER BY relType, related.created_at DESC
              SKIP $offset
              LIMIT $limit
            `
            
            const ownershipParams = getOwnershipParams({
              userId,
              workspaceId,
            })
            
            const relResult = await session.run(relQuery, {
              ...ownershipParams,
              entityId,
              relationshipTypes: params.relationshipTypes,
              offset: neo4j.int(offset),
              limit: neo4j.int(params.limit || 20),
            })
            
            const relatedItems = relResult.records.map((record: any) => {
              const entity = record.get('fullEntity').properties
              const type = inferTypeFromLabels([record.get('type')])
              const id = record.get('id')
              return {
                id: `${type}:${id}`, // Return full URI format
                type,
                relationship: record.get('relationship'),
                direction: record.get('direction'),
                title: record.get('title') || record.get('name') || record.get('filePath'),
                snippet: record.get('snippet'),
                metadata: {
                  filePath: entity.file_path,
                  language: entity.language,
                  projectName: entity.project_name,
                  occurredAt: entity.occurred_at,
                  participants: entity.participants,
                }
              }
            })
            
            // Get similar items if requested
            const similarItems: any[] = []
            if (params.includeSimilar) {
              // Use EntitySummary for similarity search
              const simQuery = `
                // Find the EntitySummary for this entity
                OPTIONAL MATCH (summary:EntitySummary)-[:SUMMARIZES]->(n {id: $entityId})
                WHERE ${ownershipFilter}
                
                // Handle case where EntitySummary might not exist
                WITH COALESCE(summary.embedding, n.embedding) as sourceEmbedding, n
                WHERE sourceEmbedding IS NOT NULL
                
                // Find similar entities via EntitySummary embeddings
                CALL db.index.vector.queryNodes('entity_summary_embeddings', 30, sourceEmbedding)
                YIELD node as similar_summary, score
                WHERE similar_summary.id <> COALESCE(summary.id, n.id)
                  AND ${ownershipFilter.replace(/n\./g, 'similar_summary.')}
                  AND score >= $threshold
                
                // Get the actual entity
                MATCH (similar_summary)-[:SUMMARIZES]->(similar_entity)
                WHERE similar_entity:Memory OR similar_entity:CodeEntity
                
                // Apply type filter if specified
                WITH similar_entity, similar_summary, score
                WHERE 
                  ($includeAllTypes = true) OR
                  (similar_entity:Memory AND $includeMemory = true) OR
                  (similar_entity:CodeEntity AND $includeCode = true)
                
                RETURN 
                  similar_entity.id as id,
                  labels(similar_entity)[0] as type,
                  score,
                  COALESCE(similar_entity.name, similar_entity.path, similar_entity.title) as name,
                  similar_entity.title as title,
                  similar_entity.file_path as filePath,
                  similar_entity.project_name as projectName,
                  substring(COALESCE(similar_entity.content, similar_summary.summary, ''), 0, 200) as snippet,
                  similar_entity as fullEntity
                ORDER BY score DESC
                LIMIT 10
              `
              
              try {
                const simResult = await session.run(simQuery, {
                  ...ownershipParams,
                  entityId,
                  threshold: params.similarityThreshold || 0.7,
                  includeAllTypes: !params.types || params.types.length === 0,
                  includeMemory: !params.types || params.types.includes('memory'),
                  includeCode: !params.types || params.types.includes('code')
                })
                
                simResult.records.forEach((record: any) => {
                  const entity = record.get('fullEntity').properties
                  const type = inferTypeFromLabels([record.get('type')])
                  const id = record.get('id')
                  similarItems.push({
                    id: `${type}:${id}`, // Return full URI format
                    type,
                    relationship: 'SIMILAR',
                    similarity: record.get('score'),
                    title: record.get('title') || record.get('name') || record.get('filePath'),
                    snippet: record.get('snippet'),
                    metadata: {
                      reason: 'Semantic similarity',
                      filePath: entity.file_path,
                      language: entity.language,
                      projectName: entity.project_name,
                      occurredAt: entity.occurred_at,
                    }
                  })
                })
              } catch (simError) {
                console.error('Similar items search failed:', simError)
                // Continue without similar results
              }
            }
            
            // Combine and deduplicate results
            const allItems = [...relatedItems, ...similarItems]
            const uniqueItems = Array.from(
              new Map(allItems.map(item => [item.id, item])).values()
            ).slice(0, params.limit || 20)
            
            // Calculate summary statistics
            const summary = {
              totalRelated: uniqueItems.length,
              byType: uniqueItems.reduce((acc, item) => {
                acc[item.type] = (acc[item.type] || 0) + 1
                return acc
              }, {} as Record<string, number>),
              byRelationship: uniqueItems.reduce((acc, item) => {
                const rel = item.relationship || 'SIMILAR'
                acc[rel] = (acc[rel] || 0) + 1
                return acc
              }, {} as Record<string, number>)
            }
            
            // Determine if there are more results
            const hasMore = relResult.records.length === (params.limit || 20)
            const nextCursor = hasMore ? 
              Buffer.from(JSON.stringify({ offset: offset + (params.limit || 20) })).toString('base64') : 
              undefined
            
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    entityUri: params.entityUri,
                    relatedItems: uniqueItems,
                    summary,
                    hasMore,
                    nextCursor,
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
        TOOL_DESCRIPTIONS.inspectEntity.name,
        TOOL_DESCRIPTIONS.inspectEntity.description,
        {
          uri: z.string().describe('Entity URI to inspect (from search result id field)'),
          includeRelationships: z.boolean().optional().default(true).describe('Include connected entities and their relationships'),
          includeContent: z.boolean().optional().default(true).describe('Include full content/code of the entity'),
          includeSimilar: z.boolean().optional().default(false).describe('Find and include semantically similar entities'),
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
            // Handle both full URI format and just ID
            let entityId = params.uri
            let entityType = 'unknown'
            
            const colonIndex = params.uri.indexOf(':')
            if (colonIndex !== -1) {
              // Full URI format provided
              entityType = params.uri.substring(0, colonIndex)
              entityId = params.uri.substring(colonIndex + 1)
            }
            
            // If no type prefix, we'll search for the entity in both Memory and CodeEntity

            const ownershipFilter = getOwnershipFilter({
              userId,
              workspaceId,
              nodeAlias: 'n',
            })

            // Get entity details - search in both Memory and CodeEntity if type unknown
            const entityQuery = entityType === 'unknown' ? `
              MATCH (n)
              WHERE n.id = $entityId 
                AND (n:Memory OR n:CodeEntity OR n:Pattern)
                AND ${ownershipFilter}
              RETURN n, labels(n) as labels
            ` : `
              MATCH (n:${entityType === 'memory' ? 'Memory' : entityType === 'code' ? 'CodeEntity' : 'Pattern'} {id: $entityId})
              WHERE ${ownershipFilter}
              RETURN n, labels(n) as labels
            `

            const ownershipParams = getOwnershipParams({
              userId,
              workspaceId,
            })
            const entityResult = await session.run(entityQuery, {
              ...ownershipParams,
              entityId
            })
            
            if (entityResult.records.length === 0) {
              throw new Error('Entity not found or access denied')
            }

            const entityRecord = entityResult.records[0]
            const entityNode = entityRecord.get('n')
            if (!entityNode || !entityNode.properties) {
              console.error('Entity node or properties missing:', entityNode)
              throw new Error('Invalid entity data structure')
            }
            const entity = entityNode.properties
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

              const relResult = await session.run(relQuery, {
                ...ownershipParams,
                entityId
              })
              relationships = relResult.records.map((record: any) => {
                const targetType = inferTypeFromLabels(record.get('targetLabels'))
                const targetId = record.get('targetId')
                return {
                  type: record.get('type'),
                  direction: record.get('isOutgoing') ? 'outgoing' : 'incoming',
                  target: {
                    id: `${targetType}:${targetId}`, // Return full URI format
                    name: record.get('targetName'),
                    type: targetType,
                  },
                }
              })
            }

            let similar: any[] = []
            if (params.includeSimilar) {
              // Use EntitySummary for similarity search
              const similarQuery = `
                // Find the EntitySummary for this entity
                MATCH (s:EntitySummary)-[:SUMMARIZES]->(n {id: $entityId})
                WHERE ${ownershipFilter}
                
                // Find similar entities via EntitySummary embeddings
                CALL db.index.vector.queryNodes('entity_summary_embeddings', 10, s.embedding)
                YIELD node as similar_summary, score
                WHERE similar_summary.id <> s.id 
                  AND ${ownershipFilter.replace(/n\./g, 'similar_summary.')}
                
                // Get the actual entity
                MATCH (similar_summary)-[:SUMMARIZES]->(similar_entity)
                WHERE similar_entity:Memory OR similar_entity:CodeEntity
                
                RETURN 
                  similar_entity.id as id, 
                  COALESCE(similar_entity.name, similar_entity.path, similar_entity.title) as name, 
                  labels(similar_entity) as labels, 
                  score
                LIMIT 5
              `

              try {
                const simResult = await session.run(similarQuery, {
                  ...ownershipParams,
                  entityId
                })
                similar = simResult.records.map((record: any) => {
                  const similarType = inferTypeFromLabels(record.get('labels'))
                  const similarId = record.get('id')
                  return {
                    id: `${similarType}:${similarId}`, // Return full URI format
                    name: record.get('name'),
                    type: similarType,
                    similarity: record.get('score'),
                  }
                })
              } catch (simError) {
                console.error('Similar entity search failed:', simError)
                // Continue without similar results
              }
            }

            // Clean up entity properties for output
            const cleanEntity = { ...entity }
            const embedding = cleanEntity.embedding
            delete cleanEntity.embedding // Remove large embedding from output
            if (!params.includeContent) {
              delete cleanEntity.content
            }

            const inferredType = inferTypeFromLabels(labels)
            const fullUri = colonIndex === -1 ? `${inferredType}:${entityId}` : params.uri
            
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    uri: fullUri,
                    type: inferredType,
                    entity: {
                      id: fullUri,
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
      capabilities: getCapabilitiesDescription(),
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