import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { neo4jService } from '@/lib/neo4j/service'
import { log } from '@/lib/logger'
import { getOwnershipFilter, getOwnershipParams } from '@/lib/neo4j/query-patterns'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's team
    const { data: profile } = await supabase
      .from('profiles')
      .select('team_id')
      .eq('id', user.id)
      .single()

    // Initialize Neo4j service
    try {
      await neo4jService.initialize()
    } catch (initError) {
      log.error('Failed to initialize Neo4j', initError, {
        service: 'MemoryStats',
        endpoint: 'GET'
      })
      // Return empty stats instead of error
      return NextResponse.json({
        totalMemories: 0,
        projectCounts: {}
      })
    }

    // Get total memory count using proper ownership filter
    const totalResult = await neo4jService.executeQuery(`
      MATCH (m:Memory)
      WHERE ${getOwnershipFilter({ userId: user.id, workspaceId: profile?.team_id ? `team:${profile.team_id}` : undefined, teamId: profile?.team_id, nodeAlias: 'm' })}
      RETURN count(m) as total
    `, getOwnershipParams({ userId: user.id, workspaceId: profile?.team_id ? `team:${profile.team_id}` : undefined, teamId: profile?.team_id }))

    const totalMemories = totalResult.records[0]?.total?.toNumber() || 0

    // Get project counts using proper ownership filter
    const projectResult = await neo4jService.executeQuery(`
      MATCH (m:Memory)
      WHERE ${getOwnershipFilter({ userId: user.id, workspaceId: profile?.team_id ? `team:${profile.team_id}` : undefined, teamId: profile?.team_id, nodeAlias: 'm' })}
      RETURN m.project_name as project, count(m) as count
      ORDER BY count DESC
    `, getOwnershipParams({ userId: user.id, workspaceId: profile?.team_id ? `team:${profile.team_id}` : undefined, teamId: profile?.team_id }))

    const projectCounts: Record<string, number> = {}
    projectResult.records.forEach((record: any) => {
      const project = record.project || 'default'
      const count = record.count?.toNumber() || 0
      projectCounts[project] = count
    })

    log.info('Memory stats retrieved', {
      service: 'MemoryStats',
      userId: user.id,
      totalMemories,
      projectCount: Object.keys(projectCounts).length
    })

    return NextResponse.json({
      totalMemories,
      projectCounts
    })

  } catch (error) {
    log.error('Failed to get memory stats', error, {
      service: 'MemoryStats',
      endpoint: 'GET'
    })
    return NextResponse.json(
      { error: 'Failed to get memory stats' }, 
      { status: 500 }
    )
  }
}