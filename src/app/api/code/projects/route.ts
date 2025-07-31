import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { neo4jService } from '@/lib/neo4j/service'
import { log } from '@/lib/logger'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Initialize Neo4j service
    try {
      await neo4jService.initialize()
    } catch (initError) {
      log.error('Failed to initialize Neo4j', initError, {
        service: 'CodeProjects',
        endpoint: 'GET'
      })
      return NextResponse.json({ projects: [] })
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

    // Debug: Count total entities
    const debugResult = await neo4jService.executeQuery(`
      MATCH (e:CodeEntity)
      RETURN count(e) as total
    `, {})
    
    const totalEntities = debugResult.records[0]?.total?.toNumber() || 0

    // Get distinct project names from code entities
    const result = await neo4jService.executeQuery(`
      MATCH (e:CodeEntity)
      WHERE (e.workspace_id = $workspaceId 
             OR e.workspace_id = $userWorkspaceId
             OR e.user_id = $userId 
             OR e.team_id = $teamId)
        AND e.project_name IS NOT NULL
      RETURN DISTINCT e.project_name as project
      ORDER BY project
    `, {
      workspaceId,
      userWorkspaceId,
      userId: user.id,
      teamId: teamId || null
    })

    log.info('Code projects debug', {
      service: 'CodeProjects',
      userId: user.id,
      teamId,
      workspaceId,
      userWorkspaceId,
      totalEntities
    })

    const projects = result.records.map((record: any) => record.project)

    log.info('Code projects retrieved', {
      service: 'CodeProjects',
      userId: user.id,
      projectCount: projects.length
    })

    return NextResponse.json({ projects })

  } catch (error) {
    log.error('Failed to get code projects', error, {
      service: 'CodeProjects',
      endpoint: 'GET'
    })
    return NextResponse.json(
      { error: 'Failed to get code projects' }, 
      { status: 500 }
    )
  }
}