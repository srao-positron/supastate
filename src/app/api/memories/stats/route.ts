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
        service: 'MemoryStats',
        endpoint: 'GET'
      })
      // Return empty stats instead of error
      return NextResponse.json({
        totalMemories: 0,
        projectCounts: {}
      })
    }

    // Get total memory count
    const totalResult = await neo4jService.executeQuery(`
      MATCH (m:Memory)
      WHERE m.user_id = $userId OR m.team_id = $userId
      RETURN count(m) as total
    `, {
      userId: user.id
    })

    const totalMemories = totalResult.records[0]?.total?.toNumber() || 0

    // Get project counts
    const projectResult = await neo4jService.executeQuery(`
      MATCH (m:Memory)
      WHERE m.user_id = $userId OR m.team_id = $userId
      RETURN m.project_name as project, count(m) as count
      ORDER BY count DESC
    `, {
      userId: user.id
    })

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