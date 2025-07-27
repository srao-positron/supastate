import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Neo4j from 'neo4j-driver'

const neo4jUri = process.env.NEO4J_URI || 'neo4j+s://eb61aceb.databases.neo4j.io'
const neo4jUser = process.env.NEO4J_USER || 'neo4j'
const neo4jPassword = process.env.NEO4J_PASSWORD || ''

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const driver = Neo4j.driver(neo4jUri, Neo4j.auth.basic(neo4jUser, neo4jPassword))
  const session = driver.session()

  try {
    // Get user's team
    const { data: profile } = await supabase
      .from('profiles')
      .select('team_id')
      .eq('id', user.id)
      .single()

    const userId = user.id
    const teamId = profile?.team_id
    const workspaceId = teamId ? `team:${teamId}` : `user:${userId}`
    const userWorkspaceId = `user:${userId}`

    // Build WHERE clause based on whether user has a team
    let whereClause = teamId 
      ? `(e.workspace_id = $workspaceId 
         OR e.workspace_id = $userWorkspaceId
         OR e.user_id = $userId 
         OR e.team_id = $teamId)`
      : `(e.workspace_id = $workspaceId 
         OR e.workspace_id = $userWorkspaceId
         OR e.user_id = $userId)`

    // Build parameters object
    const params: any = { workspaceId, userWorkspaceId, userId }
    if (teamId) {
      params.teamId = teamId
    }

    // Get code entity stats
    const result = await session.run(`
      MATCH (e:CodeEntity)
      WHERE ${whereClause}
      OPTIONAL MATCH (e)-[:DEFINED_IN]->(f:CodeFile)
      WITH e, f
      RETURN 
        COUNT(DISTINCT e) as totalEntities,
        COUNT(DISTINCT f.path) as totalFiles,
        COUNT(DISTINCT e.project_name) as totalProjects,
        COLLECT(DISTINCT e.type) as entityTypes,
        null as linkedEntities
      UNION
      MATCH (e:CodeEntity)<-[:REFERENCES_CODE]-(m:Memory)
      WHERE ${whereClause}
      RETURN 
        null as totalEntities,
        null as totalFiles,
        null as totalProjects,
        null as entityTypes,
        COUNT(DISTINCT e) as linkedEntities
    `, params)

    const stats = {
      totalEntities: 0,
      totalFiles: 0,
      totalProjects: 0,
      linkedEntities: 0,
      entityTypes: {} as Record<string, number>
    }

    for (const record of result.records) {
      if (record.get('totalEntities') !== null) {
        stats.totalEntities = record.get('totalEntities').toNumber ? record.get('totalEntities').toNumber() : record.get('totalEntities')
        stats.totalFiles = record.get('totalFiles').toNumber ? record.get('totalFiles').toNumber() : record.get('totalFiles')
        stats.totalProjects = record.get('totalProjects').toNumber ? record.get('totalProjects').toNumber() : record.get('totalProjects')
        
        const types = record.get('entityTypes') || []
        for (const type of types) {
          stats.entityTypes[type] = (stats.entityTypes[type] || 0) + 1
        }
      }
      if (record.get('linkedEntities') !== null) {
        stats.linkedEntities = record.get('linkedEntities').toNumber ? record.get('linkedEntities').toNumber() : record.get('linkedEntities')
      }
    }

    // Get entity type distribution
    const typeResult = await session.run(`
      MATCH (e:CodeEntity)
      WHERE ${whereClause}
      RETURN e.type as type, COUNT(e) as count
      ORDER BY count DESC
    `, params)

    stats.entityTypes = {}
    for (const record of typeResult.records) {
      const type = record.get('type')
      const count = record.get('count')
      if (type) {
        stats.entityTypes[type] = count.toNumber ? count.toNumber() : count
      }
    }

    return NextResponse.json({ stats })
  } catch (error) {
    console.error('Failed to get code stats:', error)
    return NextResponse.json({ 
      error: 'Failed to get code stats',
      stats: {
        totalEntities: 0,
        totalFiles: 0,
        totalProjects: 0,
        linkedEntities: 0,
        entityTypes: {}
      }
    }, { status: 200 }) // Return default stats on error
  } finally {
    await session.close()
    await driver.close()
  }
}