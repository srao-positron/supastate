import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import neo4j from 'neo4j-driver'

const querySchema = z.object({
  projectName: z.string().optional(),
  entityType: z.string().optional(),
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0),
})

// Neo4j connection
let driver: any = null

function getDriver() {
  if (!driver) {
    const NEO4J_URI = process.env.NEO4J_URI || 'neo4j+s://eb61aceb.databases.neo4j.io'
    const NEO4J_USER = process.env.NEO4J_USER || 'neo4j'
    const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD

    if (!NEO4J_PASSWORD) {
      throw new Error('NEO4J_PASSWORD environment variable is required')
    }

    driver = neo4j.driver(
      NEO4J_URI,
      neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD),
      {
        maxConnectionPoolSize: 50,
        connectionAcquisitionTimeout: 60000,
      }
    )
  }
  return driver
}

export async function GET(request: Request) {
  try {
    // Get authenticated user
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse query parameters
    const url = new URL(request.url)
    const projectName = url.searchParams.get('projectName') || undefined
    const entityType = url.searchParams.get('entityType') || undefined
    const limit = parseInt(url.searchParams.get('limit') || '50')
    const offset = parseInt(url.searchParams.get('offset') || '0')

    const params = querySchema.parse({ projectName, entityType, limit, offset })

    // Get team info
    const { data: teamMembers } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('user_id', user.id)
      .limit(1)

    const teamId = teamMembers?.[0]?.team_id

    // Get workspace ID
    const workspaceId = teamId ? `team:${teamId}` : `user:${user.id}`
    
    console.log('[Code API] Auth info:', {
      userId: user.id,
      workspaceId,
      teamId,
      projectName: params.projectName
    })

    // Get Neo4j driver
    const neo4jDriver = getDriver()
    
    // Test Neo4j connection
    try {
      await neo4jDriver.verifyConnectivity()
      console.log('[Code API] Neo4j connection verified')
    } catch (connError: any) {
      console.error('[Code API] Neo4j connection failed:', connError)
      return NextResponse.json(
        { error: 'Database connection failed', details: connError.message },
        { status: 503 }
      )
    }
    
    const session = neo4jDriver.session()

    try {
      // Build query based on filters
      // Handle both user and team workspace IDs - entities created under user workspace
      // should be accessible when user is part of a team
      let query = `
        MATCH (e:CodeEntity)
        WHERE (e.workspace_id = $workspaceId 
               OR e.workspace_id = $userWorkspaceId
               OR e.user_id = $userId 
               OR e.team_id = $teamId)
      `
      
      const queryParams: any = {
        workspaceId,
        userWorkspaceId: `user:${user.id}`, // Always include user workspace ID
        userId: user.id,
        teamId: teamId || null,
        limit: neo4j.int(params.limit),
        offset: neo4j.int(params.offset)
      }

      if (params.projectName) {
        query += ` AND e.project_name = $projectName`
        queryParams.projectName = params.projectName
      }

      if (params.entityType) {
        query += ` AND e.type = $entityType`
        queryParams.entityType = params.entityType
      }

      // Get total count
      const countQuery = query + ` RETURN count(e) as total`
      const countResult = await session.run(countQuery, queryParams)
      const total = countResult.records[0]?.get('total')?.toNumber() || 0
      
      console.log('[Code API] Query count:', {
        total,
        query: countQuery,
        params: queryParams
      })

      // Get entities with file information
      query += `
        OPTIONAL MATCH (e)-[:DEFINED_IN]->(f:CodeFile)
        RETURN e, f
        ORDER BY e.name
        SKIP $offset
        LIMIT $limit
      `

      const result = await session.run(query, queryParams)

      const entities = result.records.map((record: any) => {
        const entity = record.get('e')
        const file = record.get('f')
        
        return {
          id: entity.properties.id,
          name: entity.properties.name,
          type: entity.properties.type,
          signature: entity.properties.signature,
          lineStart: entity.properties.line_start?.toNumber(),
          lineEnd: entity.properties.line_end?.toNumber(),
          metadata: entity.properties.metadata ? JSON.parse(entity.properties.metadata) : {},
          file: file ? {
            id: file.properties.id,
            path: file.properties.path,
            language: file.properties.language
          } : null,
          projectName: entity.properties.project_name
        }
      })

      // Get entity type counts for filters
      const typeCountQuery = `
        MATCH (e:CodeEntity)
        WHERE (e.workspace_id = $workspaceId 
               OR e.workspace_id = $userWorkspaceId
               OR e.user_id = $userId 
               OR e.team_id = $teamId)
        ${params.projectName ? 'AND e.project_name = $projectName' : ''}
        RETURN e.type as type, count(e) as count
        ORDER BY count DESC
      `
      
      const typeCountResult = await session.run(typeCountQuery, {
        workspaceId,
        userWorkspaceId: `user:${user.id}`,
        userId: user.id,
        teamId: teamId || null,
        ...(params.projectName && { projectName: params.projectName })
      })

      const typeCounts = typeCountResult.records.reduce((acc: Record<string, number>, record: any) => {
        acc[record.get('type')] = record.get('count').toNumber()
        return acc
      }, {} as Record<string, number>)

      return NextResponse.json({
        entities,
        total,
        typeCounts,
        limit: params.limit,
        offset: params.offset
      })

    } finally {
      await session.close()
    }

  } catch (error: any) {
    console.error('Error fetching code entities:', error)
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    })
    return NextResponse.json(
      { 
        error: 'Failed to fetch code entities',
        details: error.message,
        code: error.code
      },
      { status: 500 }
    )
  }
}

// Search code entities
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { query, mode = 'semantic', limit = 20, projectName } = body

    // Get team info
    const { data: teamMembers } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('user_id', user.id)
      .limit(1)

    const teamId = teamMembers?.[0]?.team_id

    // Get workspace ID
    const workspaceId = teamId ? `team:${teamId}` : `user:${user.id}`

    // Get Neo4j driver
    const neo4jDriver = getDriver()
    const session = neo4jDriver.session()

    try {
      let results = []
      
      if (mode === 'semantic') {
        // Generate embedding for query
        const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'text-embedding-3-large',
            input: query,
            dimensions: 3072
          })
        })

        const embeddingData = await embeddingResponse.json()
        const queryEmbedding = embeddingData.data[0].embedding

        // Search using vector similarity
        const searchQuery = `
          CALL db.index.vector.queryNodes('entity_embeddings', $limit, $embedding)
          YIELD node as e, score
          WHERE (e.workspace_id = $workspaceId OR e.user_id = $userId OR e.team_id = $teamId)
          ${projectName ? 'AND e.project_name = $projectName' : ''}
          OPTIONAL MATCH (e)-[:DEFINED_IN]->(f:CodeFile)
          RETURN e, f, score
          ORDER BY score DESC
        `

        const result = await session.run(searchQuery, {
          embedding: queryEmbedding,
          limit: neo4j.int(limit),
          workspaceId,
          userId: user.id,
          teamId: teamId || null,
          ...(projectName && { projectName })
        })

        results = result.records.map((record: any) => ({
          entity: {
            id: record.get('e').properties.id,
            name: record.get('e').properties.name,
            type: record.get('e').properties.type,
            signature: record.get('e').properties.signature,
            lineStart: record.get('e').properties.line_start?.toNumber(),
            lineEnd: record.get('e').properties.line_end?.toNumber(),
            projectName: record.get('e').properties.project_name,
          },
          file: record.get('f') ? {
            path: record.get('f').properties.path,
            language: record.get('f').properties.language
          } : null,
          score: record.get('score')
        }))

      } else {
        // Text-based search
        const searchQuery = `
          MATCH (e:CodeEntity)
          WHERE (e.workspace_id = $workspaceId OR e.user_id = $userId OR e.team_id = $teamId)
          AND toLower(e.name) CONTAINS toLower($query)
          ${projectName ? 'AND e.project_name = $projectName' : ''}
          OPTIONAL MATCH (e)-[:DEFINED_IN]->(f:CodeFile)
          RETURN e, f
          ORDER BY e.name
          LIMIT $limit
        `

        const result = await session.run(searchQuery, {
          query,
          limit: neo4j.int(limit),
          workspaceId,
          userId: user.id,
          teamId: teamId || null,
          ...(projectName && { projectName })
        })

        results = result.records.map((record: any) => ({
          entity: {
            id: record.get('e').properties.id,
            name: record.get('e').properties.name,
            type: record.get('e').properties.type,
            signature: record.get('e').properties.signature,
            lineStart: record.get('e').properties.line_start?.toNumber(),
            lineEnd: record.get('e').properties.line_end?.toNumber(),
            projectName: record.get('e').properties.project_name,
          },
          file: record.get('f') ? {
            path: record.get('f').properties.path,
            language: record.get('f').properties.language
          } : null,
          score: 1.0
        }))
      }

      return NextResponse.json({ results })

    } finally {
      await session.close()
    }

  } catch (error) {
    console.error('Error searching code entities:', error)
    return NextResponse.json(
      { error: 'Failed to search code entities' },
      { status: 500 }
    )
  }
}