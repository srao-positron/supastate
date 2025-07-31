import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { neo4jService } from '@/lib/neo4j/service'
import { log } from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { query = '', type, project, limit = 100, offset = 0 } = body

    // Initialize Neo4j service
    try {
      await neo4jService.initialize()
    } catch (initError) {
      log.error('Failed to initialize Neo4j', initError, {
        service: 'CodeSearch',
        endpoint: 'POST'
      })
      return NextResponse.json({ entities: [] })
    }

    // Get team info to check both user and team IDs
    const { data: teamMembers } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('user_id', user.id)
      .limit(1)

    const teamId = teamMembers?.[0]?.team_id
    const workspaceId = teamId ? `team:${teamId}` : `user:${user.id}`
    const userWorkspaceId = `user:${user.id}`

    // Build the Neo4j query
    let cypherQuery = `
      MATCH (e:CodeEntity)
      WHERE (e.workspace_id = $workspaceId 
             OR e.workspace_id = $userWorkspaceId
             OR e.user_id = $userId 
             OR e.team_id = $teamId)
    `
    
    const queryParams: any = {
      workspaceId,
      userWorkspaceId,
      userId: user.id,
      teamId: teamId || null,
      limit: limit,
      offset: offset
    }

    log.info('Code search query params', {
      service: 'CodeSearch',
      userId: user.id,
      teamId,
      workspaceId,
      userWorkspaceId,
      query,
      type,
      project
    })

    // Add search condition if query is provided
    if (query) {
      cypherQuery += ` AND (toLower(e.name) CONTAINS toLower($query) OR toLower(e.summary) CONTAINS toLower($query))`
      queryParams.query = query
    }

    // Add type filter if provided
    if (type) {
      cypherQuery += ` AND e.type = $type`
      queryParams.type = type
    }

    // Add project filter if provided
    if (project) {
      cypherQuery += ` AND e.project_name = $project`
      queryParams.project = project
    }

    // Add file information and pagination
    cypherQuery += `
      OPTIONAL MATCH (e)-[:DEFINED_IN]->(f:CodeFile)
      RETURN e, f
      ORDER BY e.name
      SKIP toInteger($offset)
      LIMIT toInteger($limit)
    `

    // Debug: Count total entities in database
    const debugCountResult = await neo4jService.executeQuery(`
      MATCH (e:CodeEntity)
      RETURN count(e) as total
    `, {})
    
    const totalEntitiesInDb = debugCountResult.records[0]?.total?.toNumber() || 0
    
    log.info('Code entities debug', {
      service: 'CodeSearch',
      totalEntitiesInDb,
      cypherQuery,
      queryParams
    })

    const result = await neo4jService.executeQuery(cypherQuery, queryParams)

    const entities = result.records.map((record: any) => {
      const entity = record.e
      const file = record.f
      
      return {
        id: entity.properties.id,
        name: entity.properties.name,
        type: entity.properties.type,
        summary: entity.properties.summary,
        file: file ? {
          path: file.properties.path,
          language: file.properties.language
        } : undefined,
        start_line: entity.properties.line_start?.toNumber?.() || entity.properties.line_start,
        end_line: entity.properties.line_end?.toNumber?.() || entity.properties.line_end,
        project_name: entity.properties.project_name,
        created_at: entity.properties.created_at,
        updated_at: entity.properties.updated_at
      }
    })

    log.info('Code entities searched', {
      service: 'CodeSearch',
      userId: user.id,
      query,
      type,
      project,
      resultCount: entities.length
    })

    return NextResponse.json({ entities })

  } catch (error) {
    log.error('Failed to search code entities', error, {
      service: 'CodeSearch',
      endpoint: 'POST'
    })
    return NextResponse.json(
      { error: 'Failed to search code entities' }, 
      { status: 500 }
    )
  }
}