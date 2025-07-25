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
        service: 'MemoryProjects',
        endpoint: 'GET'
      })
      // Return empty array instead of error
      return NextResponse.json([])
    }

    // Get distinct project names
    const projectResult = await neo4jService.executeQuery(`
      MATCH (m:Memory)
      WHERE m.user_id = $userId OR m.team_id = $userId
      RETURN DISTINCT m.project_name as project
      ORDER BY project
    `, {
      userId: user.id
    })

    const projects = projectResult.records
      .map((record: any) => record.project)
      .filter((project: string) => project && project.trim() !== '')

    log.info('Projects retrieved', {
      service: 'MemoryProjects',
      userId: user.id,
      projectCount: projects.length
    })

    return NextResponse.json(projects)

  } catch (error) {
    log.error('Failed to get projects', error, {
      service: 'MemoryProjects',
      endpoint: 'GET'
    })
    return NextResponse.json(
      { error: 'Failed to get projects' }, 
      { status: 500 }
    )
  }
}