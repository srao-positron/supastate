import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Neo4j from 'neo4j-driver'

const neo4jUri = process.env.NEO4J_URI || 'bolt://localhost:7687'
const neo4jUser = process.env.NEO4J_USER || 'neo4j'
const neo4jPassword = process.env.NEO4J_PASSWORD || 'password'

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
    const workspaceId = `user:${userId}`
    const userWorkspaceId = `user:${userId}`

    // Get code entity stats
    const result = await session.run(`
      MATCH (e:Entity)
      WHERE (e.workspace_id = $workspaceId 
             OR e.workspace_id = $userWorkspaceId
             OR e.user_id = $userId 
             OR e.team_id = $teamId)
      WITH e
      RETURN 
        COUNT(DISTINCT e) as totalEntities,
        COUNT(DISTINCT e.file_path) as totalFiles,
        COUNT(DISTINCT e.project_path) as totalProjects,
        COLLECT(DISTINCT e.type) as entityTypes
      UNION
      MATCH (e:Entity)-[:RELATED_TO]->(m:Memory)
      WHERE (e.workspace_id = $workspaceId 
             OR e.workspace_id = $userWorkspaceId
             OR e.user_id = $userId 
             OR e.team_id = $teamId)
      RETURN 
        null as totalEntities,
        null as totalFiles,
        null as totalProjects,
        null as entityTypes,
        COUNT(DISTINCT e) as linkedEntities
    `, { workspaceId, userWorkspaceId, userId, teamId })

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
      } else if (record.get('linkedEntities') !== null) {
        stats.linkedEntities = record.get('linkedEntities').toNumber ? record.get('linkedEntities').toNumber() : record.get('linkedEntities')
      }
    }

    // Get entity type distribution
    const typeResult = await session.run(`
      MATCH (e:Entity)
      WHERE (e.workspace_id = $workspaceId 
             OR e.workspace_id = $userWorkspaceId
             OR e.user_id = $userId 
             OR e.team_id = $teamId)
      RETURN e.type as type, COUNT(e) as count
      ORDER BY count DESC
    `, { workspaceId, userWorkspaceId, userId, teamId })

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