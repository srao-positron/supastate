import { createMcpHandler } from "@vercel/mcp-adapter"
import { z } from "zod"
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import neo4j from 'neo4j-driver'
import { getOwnershipFilter } from '@/lib/neo4j/query-patterns'

// Tool schemas
const SearchSchema = z.object({
  query: z.string().describe('Natural language search query'),
  types: z.array(z.enum(['code', 'memory', 'github'])).optional().describe('Filter by entity types'),
  limit: z.number().optional().default(20).describe('Maximum results'),
  workspace: z.string().optional().describe('Specific workspace filter'),
})

const SearchCodeSchema = z.object({
  query: z.string().describe('Code pattern or natural language'),
  language: z.string().optional().describe('Filter by programming language'),
  project: z.string().optional().describe('Filter by project name'),
  includeTests: z.boolean().optional().default(false),
  includeImports: z.boolean().optional().default(true),
})

const SearchMemoriesSchema = z.object({
  query: z.string().describe('Natural language query'),
  dateRange: z.object({
    start: z.string().optional(),
    end: z.string().optional(),
  }).optional(),
  projects: z.array(z.string()).optional(),
})

const ExploreRelationshipsSchema = z.object({
  entityUri: z.string().describe('Starting entity URI'),
  relationshipTypes: z.array(z.string()).optional(),
  depth: z.number().optional().default(2).max(3),
  direction: z.enum(['in', 'out', 'both']).optional().default('both'),
})

const InspectEntitySchema = z.object({
  uri: z.string().describe('Entity URI to inspect'),
  includeRelationships: z.boolean().optional().default(true),
  includeContent: z.boolean().optional().default(true),
  includeSimilar: z.boolean().optional().default(false),
})

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

const handler = createMcpHandler(
  async (server) => {
    // Get authenticated user context
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    
    if (error || !user) {
      throw new Error('Authentication required')
    }

    // Get user workspace info
    const { data: userData } = await supabase
      .from('users')
      .select('id, team_id')
      .eq('id', user.id)
      .single()

    const userId = user.id
    const workspaceId = userData?.team_id ? `team:${userData.team_id}` : `user:${user.id}`

    // Initialize Neo4j
    const neo4jDriver = neo4j.driver(
      process.env.NEO4J_URI!,
      neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
    )

    // Register tools
    server.tool(
      "search",
      "Search across code, memories, and GitHub data using natural language",
      SearchSchema,
      async ({ query, types, limit, workspace }) => {
        const session = neo4jDriver.session()
        try {
          const ownershipFilter = getOwnershipFilter({
            userId,
            workspaceId,
            nodeAlias: 'n',
          })

          let typeFilter = ''
          if (types && types.length > 0) {
            const labels = types.map(t => {
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

          const embedding = await getEmbedding(query)
          const result = await session.run(cypherQuery, {
            embedding,
            limit: limit || 20,
          })

          const results = result.records.map(record => ({
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
                  query,
                  totalResults: results.length,
                }, null, 2),
              },
            ],
          }
        } finally {
          await session.close()
        }
      }
    )

    server.tool(
      "searchCode",
      "Search code with language-specific understanding",
      SearchCodeSchema,
      async ({ query, language, project, includeTests, includeImports }) => {
        const session = neo4jDriver.session()
        try {
          const ownershipFilter = getOwnershipFilter({
            userId,
            workspaceId,
            nodeAlias: 'c',
          })

          let additionalFilters = ''
          if (language) {
            additionalFilters += ` AND c.language = $language`
          }
          if (project) {
            additionalFilters += ` AND c.project_name = $project`
          }
          if (!includeTests) {
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

          const embedding = await getEmbedding(query)
          const result = await session.run(cypherQuery, {
            embedding,
            language,
            project,
          })

          const results = result.records.map(record => ({
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
                  query,
                  filters: {
                    language,
                    project,
                    includeTests,
                  },
                }, null, 2),
              },
            ],
          }
        } finally {
          await session.close()
        }
      }
    )

    server.tool(
      "searchMemories",
      "Search development conversations and decisions",
      SearchMemoriesSchema,
      async ({ query, dateRange, projects }) => {
        const session = neo4jDriver.session()
        try {
          const ownershipFilter = getOwnershipFilter({
            userId,
            workspaceId,
            nodeAlias: 'm',
          })

          let dateFilter = ''
          if (dateRange) {
            if (dateRange.start) {
              dateFilter += ` AND m.occurred_at >= datetime($startDate)`
            }
            if (dateRange.end) {
              dateFilter += ` AND m.occurred_at <= datetime($endDate)`
            }
          }

          let projectFilter = ''
          if (projects && projects.length > 0) {
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

          const embedding = await getEmbedding(query)
          const result = await session.run(cypherQuery, {
            embedding,
            startDate: dateRange?.start,
            endDate: dateRange?.end,
            projects,
          })

          const results = result.records.map(record => ({
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
                  query,
                  filters: {
                    dateRange,
                    projects,
                  },
                }, null, 2),
              },
            ],
          }
        } finally {
          await session.close()
        }
      }
    )

    server.tool(
      "exploreRelationships",
      "Find connections between entities in the knowledge graph",
      ExploreRelationshipsSchema,
      async ({ entityUri, relationshipTypes, depth, direction }) => {
        const session = neo4jDriver.session()
        try {
          const [entityType, ...idParts] = entityUri.split('://')
          const entityId = idParts.join('://')

          const ownershipFilter = getOwnershipFilter({
            userId,
            workspaceId,
            nodeAlias: 'n',
          })

          let relationshipFilter = ''
          if (relationshipTypes && relationshipTypes.length > 0) {
            relationshipFilter = `[r:${relationshipTypes.join('|')}]`
          } else {
            relationshipFilter = '[r]'
          }

          let directionQuery = ''
          switch (direction) {
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
            depth: depth || 2,
          })

          const relationships = result.records.map(record => ({
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
                  entityUri,
                  relationships,
                  totalRelationships: relationships.length,
                  maxDepth: depth,
                }, null, 2),
              },
            ],
          }
        } finally {
          await session.close()
        }
      }
    )

    server.tool(
      "inspectEntity",
      "Get comprehensive details about any entity",
      InspectEntitySchema,
      async ({ uri, includeRelationships, includeContent, includeSimilar }) => {
        const session = neo4jDriver.session()
        try {
          const [entityType, ...idParts] = uri.split('://')
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

          let relationships = []
          if (includeRelationships) {
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
            relationships = relResult.records.map(record => ({
              type: record.get('type'),
              direction: record.get('isOutgoing') ? 'outgoing' : 'incoming',
              target: {
                id: record.get('targetId'),
                name: record.get('targetName'),
                type: inferTypeFromLabels(record.get('targetLabels')),
              },
            }))
          }

          let similar = []
          if (includeSimilar && entity.embedding) {
            const similarQuery = `
              CALL db.index.vector.queryNodes('unified_embeddings', 6, $embedding)
              YIELD node as s, score
              WHERE s.id <> $entityId AND ${ownershipFilter.replace('n.', 's.')}
              RETURN s.id as id, s.name as name, labels(s) as labels, score
              LIMIT 5
            `

            const similarResult = await session.run(similarQuery, {
              entityId,
              embedding: entity.embedding,
            })

            similar = similarResult.records.map(record => ({
              id: record.get('id'),
              name: record.get('name'),
              type: inferTypeFromLabels(record.get('labels')),
              score: record.get('score'),
            }))
          }

          // Clean up entity for response
          const { embedding, ...cleanEntity } = entity

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  uri,
                  type: inferTypeFromLabels(labels),
                  entity: {
                    ...cleanEntity,
                    hasEmbedding: !!embedding,
                  },
                  relationships: includeRelationships ? relationships : undefined,
                  similar: includeSimilar ? similar : undefined,
                }, null, 2),
              },
            ],
          }
        } finally {
          await session.close()
        }
      }
    )

    // Clean up Neo4j driver on server close
    server.onClose(async () => {
      await neo4jDriver.close()
    })
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
          description: "Search development conversations",
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
  }
)

export { handler as GET, handler as POST, handler as DELETE }