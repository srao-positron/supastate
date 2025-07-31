import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  Tool,
  Resource,
} from '@modelcontextprotocol/sdk/types.js'
import { createClient } from '@supabase/supabase-js'
import neo4j from 'neo4j-driver'
import { z } from 'zod'
import { getOwnershipFilter } from '@/lib/neo4j/query-patterns'

// Tool schemas
const SearchToolSchema = z.object({
  query: z.string().describe('Natural language search query'),
  types: z.array(z.enum(['code', 'memory', 'github'])).optional().describe('Filter by entity types'),
  limit: z.number().optional().default(20).describe('Maximum results'),
  workspace: z.string().optional().describe('Specific workspace filter'),
})

const SearchCodeToolSchema = z.object({
  query: z.string().describe('Code pattern or natural language'),
  language: z.string().optional().describe('Filter by programming language'),
  project: z.string().optional().describe('Filter by project name'),
  includeTests: z.boolean().optional().default(false),
  includeImports: z.boolean().optional().default(true),
})

const SearchMemoriesToolSchema = z.object({
  query: z.string().describe('Natural language query'),
  dateRange: z.object({
    start: z.string().optional(),
    end: z.string().optional(),
  }).optional(),
  projects: z.array(z.string()).optional(),
})

const ExploreRelationshipsToolSchema = z.object({
  entityUri: z.string().describe('Starting entity URI'),
  relationshipTypes: z.array(z.string()).optional(),
  depth: z.number().optional().default(2).max(3),
  direction: z.enum(['in', 'out', 'both']).optional().default('both'),
})

const InspectEntityToolSchema = z.object({
  uri: z.string().describe('Entity URI to inspect'),
  includeRelationships: z.boolean().optional().default(true),
  includeContent: z.boolean().optional().default(true),
  includeSimilar: z.boolean().optional().default(false),
})

export class SupastateMCPServer {
  private server: Server
  private supabase: ReturnType<typeof createClient> | null = null
  private neo4jDriver: neo4j.Driver
  private userId: string | null = null
  private workspaceId: string | null = null

  constructor() {
    this.server = new Server(
      {
        name: 'supastate-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    )

    this.neo4jDriver = neo4j.driver(
      process.env.NEO4J_URI!,
      neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
    )

    this.setupHandlers()
  }

  private setupHandlers() {
    // Tool handlers
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.getTools(),
    }))

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      // Extract auth token from request context (MCP will pass this)
      const authToken = request.params._meta?.authToken as string
      if (!authToken) {
        throw new Error('Authentication required. Please provide your Supabase auth token.')
      }

      // Initialize Supabase client with user token
      await this.initializeAuth(authToken)

      const { name, arguments: args } = request.params

      switch (name) {
        case 'search':
          return await this.handleSearch(args)
        case 'searchCode':
          return await this.handleSearchCode(args)
        case 'searchMemories':
          return await this.handleSearchMemories(args)
        case 'exploreRelationships':
          return await this.handleExploreRelationships(args)
        case 'inspectEntity':
          return await this.handleInspectEntity(args)
        default:
          throw new Error(`Unknown tool: ${name}`)
      }
    })

    // Resource handlers
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: await this.listResources(),
    }))

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params
      return await this.readResource(uri)
    })
  }

  private async initializeAuth(authToken: string) {
    // Create Supabase client with user's token
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        },
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    // Get user info
    const { data: { user }, error } = await this.supabase.auth.getUser()
    if (error || !user) {
      throw new Error('Invalid authentication token')
    }

    // Get user's workspace info
    const { data: userData } = await this.supabase
      .from('users')
      .select('id, team_id')
      .eq('id', user.id)
      .single()

    this.userId = user.id
    this.workspaceId = userData?.team_id ? `team:${userData.team_id}` : `user:${user.id}`
  }

  private getTools(): Tool[] {
    return [
      {
        name: 'search',
        description: 'Search across code, memories, and GitHub data using natural language. Returns unified results from all entity types.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Natural language search query' },
            types: { 
              type: 'array', 
              items: { type: 'string', enum: ['code', 'memory', 'github'] },
              description: 'Filter by entity types' 
            },
            limit: { type: 'number', description: 'Maximum results (default 20)' },
            workspace: { type: 'string', description: 'Specific workspace filter' },
          },
          required: ['query'],
        },
      },
      {
        name: 'searchCode',
        description: 'Search code with language-specific understanding. Finds functions, classes, patterns, and implementations.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Code pattern or natural language' },
            language: { type: 'string', description: 'Filter by programming language' },
            project: { type: 'string', description: 'Filter by project name' },
            includeTests: { type: 'boolean', description: 'Include test files' },
            includeImports: { type: 'boolean', description: 'Include import statements' },
          },
          required: ['query'],
        },
      },
      {
        name: 'searchMemories',
        description: 'Search development conversations and decisions with temporal awareness.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Natural language query' },
            dateRange: { 
              type: 'object',
              properties: {
                start: { type: 'string', description: 'ISO date string' },
                end: { type: 'string', description: 'ISO date string' },
              }
            },
            projects: { 
              type: 'array', 
              items: { type: 'string' },
              description: 'Filter by projects discussed' 
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'exploreRelationships',
        description: 'Find connections between entities in the knowledge graph.',
        inputSchema: {
          type: 'object',
          properties: {
            entityUri: { type: 'string', description: 'Starting entity URI' },
            relationshipTypes: { 
              type: 'array', 
              items: { type: 'string' },
              description: 'Filter by relationship types' 
            },
            depth: { type: 'number', description: 'Traversal depth (max 3)' },
            direction: { 
              type: 'string', 
              enum: ['in', 'out', 'both'],
              description: 'Relationship direction' 
            },
          },
          required: ['entityUri'],
        },
      },
      {
        name: 'inspectEntity',
        description: 'Get comprehensive details about any entity including code, memory, or GitHub object.',
        inputSchema: {
          type: 'object',
          properties: {
            uri: { type: 'string', description: 'Entity URI to inspect' },
            includeRelationships: { type: 'boolean', description: 'Include related entities' },
            includeContent: { type: 'boolean', description: 'Include full content' },
            includeSimilar: { type: 'boolean', description: 'Include similar entities' },
          },
          required: ['uri'],
        },
      },
    ]
  }

  private async handleSearch(args: unknown) {
    const params = SearchToolSchema.parse(args)
    const session = this.neo4jDriver.session()

    try {
      const ownershipFilter = getOwnershipFilter({
        userId: this.userId!,
        workspaceId: this.workspaceId!,
        nodeAlias: 'n',
      })

      // Build type filter
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

      // Semantic search using vector index
      const query = `
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

      // Get embedding for query
      const embedding = await this.getEmbedding(params.query)

      const result = await session.run(query, {
        embedding,
        limit: params.limit || 20,
      })

      const results = result.records.map(record => ({
        id: record.get('id'),
        name: record.get('name'),
        type: this.inferTypeFromLabels(record.get('labels')),
        content: record.get('content'),
        summary: record.get('summary'),
        filePath: record.get('filePath'),
        projectName: record.get('projectName'),
        score: record.get('score'),
      }))

      return {
        content: [
          {
            type: 'text',
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
    }
  }

  private async handleSearchCode(args: unknown) {
    const params = SearchCodeToolSchema.parse(args)
    const session = this.neo4jDriver.session()

    try {
      const ownershipFilter = getOwnershipFilter({
        userId: this.userId!,
        workspaceId: this.workspaceId!,
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

      const query = `
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

      const embedding = await this.getEmbedding(params.query)

      const result = await session.run(query, {
        embedding,
        language: params.language,
        project: params.project,
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
            type: 'text',
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
    }
  }

  private async handleSearchMemories(args: unknown) {
    const params = SearchMemoriesToolSchema.parse(args)
    const session = this.neo4jDriver.session()

    try {
      const ownershipFilter = getOwnershipFilter({
        userId: this.userId!,
        workspaceId: this.workspaceId!,
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

      const query = `
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

      const embedding = await this.getEmbedding(params.query)

      const result = await session.run(query, {
        embedding,
        startDate: params.dateRange?.start,
        endDate: params.dateRange?.end,
        projects: params.projects,
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
            type: 'text',
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
    }
  }

  private async handleExploreRelationships(args: unknown) {
    const params = ExploreRelationshipsToolSchema.parse(args)
    const session = this.neo4jDriver.session()

    try {
      // Parse entity URI
      const [entityType, ...idParts] = params.entityUri.split('://')
      const entityId = idParts.join('://')

      const ownershipFilter = getOwnershipFilter({
        userId: this.userId!,
        workspaceId: this.workspaceId!,
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

      const query = `
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

      const result = await session.run(query, {
        entityId,
        depth: params.depth || 2,
      })

      const relationships = result.records.map(record => ({
        source: {
          id: record.get('startId'),
          name: record.get('startName'),
          type: this.inferTypeFromLabels(record.get('startLabels')),
        },
        relationship: record.get('relationshipType'),
        target: {
          id: record.get('endId'),
          name: record.get('endName'),
          type: this.inferTypeFromLabels(record.get('endLabels')),
        },
        distance: record.get('distance'),
      }))

      return {
        content: [
          {
            type: 'text',
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
    }
  }

  private async handleInspectEntity(args: unknown) {
    const params = InspectEntityToolSchema.parse(args)
    const session = this.neo4jDriver.session()

    try {
      // Parse entity URI
      const [entityType, ...idParts] = params.uri.split('://')
      const entityId = idParts.join('://')

      const ownershipFilter = getOwnershipFilter({
        userId: this.userId!,
        workspaceId: this.workspaceId!,
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
        relationships = relResult.records.map(record => ({
          type: record.get('type'),
          direction: record.get('isOutgoing') ? 'outgoing' : 'incoming',
          target: {
            id: record.get('targetId'),
            name: record.get('targetName'),
            type: this.inferTypeFromLabels(record.get('targetLabels')),
          },
        }))
      }

      let similar = []
      if (params.includeSimilar && entity.embedding) {
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
          type: this.inferTypeFromLabels(record.get('labels')),
          score: record.get('score'),
        }))
      }

      // Clean up entity for response
      const { embedding, ...cleanEntity } = entity

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              uri: params.uri,
              type: this.inferTypeFromLabels(labels),
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
    }
  }

  private async listResources(): Promise<Resource[]> {
    // For now, return empty array
    // In future, could list recent entities, projects, etc.
    return []
  }

  private async readResource(uri: string): Promise<{ contents: any[] }> {
    // Parse and read specific resources
    // This would use similar logic to inspectEntity
    return { contents: [] }
  }

  private async getEmbedding(text: string): Promise<number[]> {
    if (!this.supabase) {
      throw new Error('Not authenticated')
    }

    // Use OpenAI to generate embeddings via edge function
    const { data, error } = await this.supabase.functions.invoke('generate-embeddings', {
      body: { texts: [text] },
    })

    if (error || !data?.embeddings?.[0]) {
      throw new Error('Failed to generate embedding')
    }

    return data.embeddings[0]
  }

  private inferTypeFromLabels(labels: string[]): string {
    if (labels.includes('CodeEntity')) return 'code'
    if (labels.includes('Memory')) return 'memory'
    if (labels.includes('GitHubEntity')) return 'github'
    return 'unknown'
  }

  async start() {
    const transport = new StdioServerTransport()
    await this.server.connect(transport)
    console.error('Supastate MCP server started')
  }

  async stop() {
    await this.neo4jDriver.close()
    await this.server.close()
  }
}

// Start server if run directly
if (require.main === module) {
  const server = new SupastateMCPServer()
  server.start().catch(console.error)

  process.on('SIGINT', async () => {
    await server.stop()
    process.exit(0)
  })
}