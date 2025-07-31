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
        service: 'MemoryInsights',
        endpoint: 'GET'
      })
      // Return empty insights data instead of error
      return NextResponse.json({
        totalWords: 0,
        avgWordsPerMemory: 0,
        uniqueSessions: 0,
        topProjects: [],
        typeDistribution: {},
        projectCounts: {}
      })
    }

    // Get total word count and average words per memory
    const wordStatsResult = await neo4jService.executeQuery(`
      MATCH (m:Memory)
      WHERE ${getOwnershipFilter({ userId: user.id, workspaceId: profile?.team_id ? `team:${profile.team_id}` : undefined, teamId: profile?.team_id, nodeAlias: 'm' })}
      WITH m, size(split(m.content, ' ')) as wordCount
      RETURN 
        sum(wordCount) as totalWords,
        avg(wordCount) as avgWordsPerMemory,
        count(m) as totalMemories
    `, getOwnershipParams({ userId: user.id, workspaceId: profile?.team_id ? `team:${profile.team_id}` : undefined, teamId: profile?.team_id }))

    let totalWords = 0
    let avgWordsPerMemory = 0
    let totalMemories = 0
    
    if (wordStatsResult.records.length > 0) {
      const wordStats = wordStatsResult.records[0]
      totalWords = wordStats.totalWords?.toNumber() || 0
      avgWordsPerMemory = Math.round(wordStats.avgWordsPerMemory || 0)
      totalMemories = wordStats.totalMemories?.toNumber() || 0
    }

    // Get unique sessions count - fixed to handle the ownership pattern correctly
    const sessionsResult = await neo4jService.executeQuery(`
      MATCH (m:Memory)
      WHERE ${getOwnershipFilter({ userId: user.id, workspaceId: profile?.team_id ? `team:${profile.team_id}` : undefined, teamId: profile?.team_id, nodeAlias: 'm' })}
        AND m.chunk_id IS NOT NULL
      RETURN count(DISTINCT m.chunk_id) as uniqueSessions
    `, getOwnershipParams({ userId: user.id, workspaceId: profile?.team_id ? `team:${profile.team_id}` : undefined, teamId: profile?.team_id }))

    const uniqueSessions = sessionsResult.records.length > 0 ? sessionsResult.records[0].uniqueSessions?.toNumber() || 0 : 0

    // Get project distribution
    const projectsResult = await neo4jService.executeQuery(`
      MATCH (m:Memory)
      WHERE ${getOwnershipFilter({ userId: user.id, workspaceId: profile?.team_id ? `team:${profile.team_id}` : undefined, teamId: profile?.team_id, nodeAlias: 'm' })}
      WITH m.project_name as project, count(m) as count
      ORDER BY count DESC
      RETURN project, count
    `, getOwnershipParams({ userId: user.id, workspaceId: profile?.team_id ? `team:${profile.team_id}` : undefined, teamId: profile?.team_id }))

    const projectCounts: Record<string, number> = {}
    const topProjects: Array<[string, number]> = []
    
    projectsResult.records.forEach((record: any, index: number) => {
      const project = record.project
      const count = record.count?.toNumber() || 0
      projectCounts[project] = count
      
      if (index < 5) {
        topProjects.push([project, count])
      }
    })

    // Get memory type distribution
    const typeResult = await neo4jService.executeQuery(`
      MATCH (m:Memory)
      WHERE ${getOwnershipFilter({ userId: user.id, workspaceId: profile?.team_id ? `team:${profile.team_id}` : undefined, teamId: profile?.team_id, nodeAlias: 'm' })}
      WITH m.type as type, count(m) as count
      RETURN type, count
    `, getOwnershipParams({ userId: user.id, workspaceId: profile?.team_id ? `team:${profile.team_id}` : undefined, teamId: profile?.team_id }))

    const typeDistribution: Record<string, number> = {}
    typeResult.records.forEach((record: any) => {
      const type = record.type || 'general'
      const count = record.count?.toNumber() || 0
      typeDistribution[type] = count
    })

    // Get recent activity summary
    const recentActivityResult = await neo4jService.executeQuery(`
      MATCH (m:Memory)
      WHERE (m.user_id = $userId OR m.team_id = $userId)
        AND (m.occurred_at IS NOT NULL OR m.created_at IS NOT NULL)
        AND datetime(COALESCE(m.occurred_at, m.created_at)) >= datetime() - duration({days: 7})
      RETURN count(m) as recentMemories
    `, {
      userId: user.id
    })

    const recentMemories = recentActivityResult.records.length > 0 ? recentActivityResult.records[0].recentMemories?.toNumber() || 0 : 0

    // Get memory growth rate (memories per day over last 30 days)
    const growthResult = await neo4jService.executeQuery(`
      MATCH (m:Memory)
      WHERE (m.user_id = $userId OR m.team_id = $userId)
        AND (m.occurred_at IS NOT NULL OR m.created_at IS NOT NULL)
        AND datetime(COALESCE(m.occurred_at, m.created_at)) >= datetime() - duration({days: 30})
      WITH count(m) as memoriesLast30Days
      RETURN toFloat(memoriesLast30Days) / 30.0 as avgMemoriesPerDay
    `, {
      userId: user.id
    })

    const avgMemoriesPerDay = growthResult.records.length > 0 ? growthResult.records[0].avgMemoriesPerDay || 0 : 0

    log.info('Memory insights data retrieved', {
      service: 'MemoryInsights',
      userId: user.id,
      totalMemories,
      uniqueSessions,
      projectCount: Object.keys(projectCounts).length
    })

    return NextResponse.json({
      totalWords,
      avgWordsPerMemory,
      uniqueSessions,
      topProjects,
      typeDistribution,
      projectCounts,
      totalMemories,
      recentMemories,
      avgMemoriesPerDay: Math.round(avgMemoriesPerDay * 10) / 10
    })

  } catch (error) {
    log.error('Failed to get memory insights', error, {
      service: 'MemoryInsights',
      endpoint: 'GET'
    })
    return NextResponse.json(
      { error: 'Failed to get memory insights' }, 
      { status: 500 }
    )
  }
}