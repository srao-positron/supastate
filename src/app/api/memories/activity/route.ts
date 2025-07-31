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
        service: 'MemoryActivity',
        endpoint: 'GET'
      })
      // Return empty activity data instead of error
      return NextResponse.json({
        dailyActivity: [],
        hourlyDistribution: [],
        totalMemories: 0
      })
    }

    // Get daily activity for the last 30 days using occurred_at (fallback to created_at)
    const dailyActivityResult = await neo4jService.executeQuery(`
      MATCH (m:Memory)
      WHERE ${getOwnershipFilter({ userId: user.id, workspaceId: profile?.team_id ? `team:${profile.team_id}` : undefined, teamId: profile?.team_id, nodeAlias: 'm' })}
        AND (m.occurred_at IS NOT NULL OR m.created_at IS NOT NULL)
        AND datetime(COALESCE(m.occurred_at, m.created_at)) >= datetime() - duration({days: 30})
      WITH date(datetime(COALESCE(m.occurred_at, m.created_at))) as day, count(m) as count
      ORDER BY day
      RETURN day, count
    `, getOwnershipParams({ userId: user.id, workspaceId: profile?.team_id ? `team:${profile.team_id}` : undefined, teamId: profile?.team_id }))

    // Generate the full 30-day array including days with no activity
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const date = new Date()
      date.setDate(date.getDate() - (29 - i))
      date.setHours(0, 0, 0, 0)
      return date.toISOString().split('T')[0]
    })

    // Create a map from the query results
    const activityMap: Record<string, number> = {}
    dailyActivityResult.records.forEach((record: any) => {
      const day = record.day?.toString()
      const count = record.count?.toNumber() || 0
      if (day) {
        activityMap[day] = count
      }
    })

    // Build the complete daily activity array
    const dailyActivity = last30Days.map(dateStr => ({
      date: dateStr,
      count: activityMap[dateStr] || 0
    }))

    // Get hourly distribution for all time using occurred_at (fallback to created_at)
    const hourlyResult = await neo4jService.executeQuery(`
      MATCH (m:Memory)
      WHERE ${getOwnershipFilter({ userId: user.id, workspaceId: profile?.team_id ? `team:${profile.team_id}` : undefined, teamId: profile?.team_id, nodeAlias: 'm' })}
        AND (m.occurred_at IS NOT NULL OR m.created_at IS NOT NULL)
      WITH datetime(COALESCE(m.occurred_at, m.created_at)).hour as hour, count(m) as count
      ORDER BY hour
      RETURN hour, count
    `, getOwnershipParams({ userId: user.id, workspaceId: profile?.team_id ? `team:${profile.team_id}` : undefined, teamId: profile?.team_id }))

    // Build hourly distribution for all 24 hours
    const hourlyMap: Record<number, number> = {}
    hourlyResult.records.forEach((record: any) => {
      const hour = record.hour?.toNumber()
      const count = record.count?.toNumber() || 0
      if (hour !== null && hour !== undefined) {
        hourlyMap[hour] = count
      }
    })

    const hourlyDistribution = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      count: hourlyMap[hour] || 0
    }))

    // Get total count
    const totalResult = await neo4jService.executeQuery(`
      MATCH (m:Memory)
      WHERE ${getOwnershipFilter({ userId: user.id, workspaceId: profile?.team_id ? `team:${profile.team_id}` : undefined, teamId: profile?.team_id, nodeAlias: 'm' })}
      RETURN count(m) as total
    `, getOwnershipParams({ userId: user.id, workspaceId: profile?.team_id ? `team:${profile.team_id}` : undefined, teamId: profile?.team_id }))

    const totalMemories = totalResult.records.length > 0 ? totalResult.records[0].total?.toNumber() || 0 : 0

    // Get weekly pattern (by day of week) using occurred_at (fallback to created_at)
    const weeklyResult = await neo4jService.executeQuery(`
      MATCH (m:Memory)
      WHERE ${getOwnershipFilter({ userId: user.id, workspaceId: profile?.team_id ? `team:${profile.team_id}` : undefined, teamId: profile?.team_id, nodeAlias: 'm' })}
        AND (m.occurred_at IS NOT NULL OR m.created_at IS NOT NULL)
      WITH 
        CASE datetime(COALESCE(m.occurred_at, m.created_at)).dayOfWeek
          WHEN 1 THEN 0
          WHEN 2 THEN 1
          WHEN 3 THEN 2
          WHEN 4 THEN 3
          WHEN 5 THEN 4
          WHEN 6 THEN 5
          WHEN 7 THEN 6
        END as dayIndex,
        count(m) as count
      ORDER BY dayIndex
      RETURN dayIndex, count
    `, getOwnershipParams({ userId: user.id, workspaceId: profile?.team_id ? `team:${profile.team_id}` : undefined, teamId: profile?.team_id }))

    // Build weekly pattern for all 7 days
    const weeklyMap: Record<number, number> = {}
    weeklyResult.records.forEach((record: any) => {
      const dayIndex = record.dayIndex?.toNumber()
      const count = record.count?.toNumber() || 0
      if (dayIndex !== null && dayIndex !== undefined) {
        weeklyMap[dayIndex] = count
      }
    })

    const weeklyPattern = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => ({
      day,
      count: weeklyMap[index] || 0
    }))

    log.info('Memory activity data retrieved', {
      service: 'MemoryActivity',
      userId: user.id,
      totalMemories,
      activeDays: Object.keys(activityMap).length,
      weeklyData: weeklyPattern
    })

    return NextResponse.json({
      dailyActivity,
      hourlyDistribution,
      weeklyPattern,
      totalMemories
    })

  } catch (error) {
    log.error('Failed to get memory activity', error, {
      service: 'MemoryActivity',
      endpoint: 'GET'
    })
    return NextResponse.json(
      { error: 'Failed to get memory activity' }, 
      { status: 500 }
    )
  }
}