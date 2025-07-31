import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Neo4j from 'neo4j-driver'
import { getOwnershipFilter, getOwnershipParams } from '@/lib/neo4j/query-patterns'

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

    // Use standard ownership filter
    const ownershipFilter = getOwnershipFilter({ 
      userId, 
      workspaceId: teamId ? workspaceId : undefined,
      teamId,
      nodeAlias: 'e' 
    })
    const params = getOwnershipParams({ userId, workspaceId: teamId ? workspaceId : undefined, teamId })

    // Get code entity stats - fixed to count files correctly
    const result = await session.run(`
      MATCH (e:CodeEntity)
      WHERE ${ownershipFilter}
      WITH e
      RETURN 
        COUNT(DISTINCT e) as totalEntities,
        COUNT(DISTINCT e.path) as totalFiles,
        COUNT(DISTINCT e.project_name) as totalProjects,
        COLLECT(DISTINCT e.type) as entityTypes
    `, params)

    // Get linked entities count separately
    const linkedResult = await session.run(`
      MATCH (e:CodeEntity)
      WHERE ${ownershipFilter}
        AND EXISTS((e)<-[:REFERENCES_CODE|DISCUSSES]-(:Memory))
      RETURN COUNT(DISTINCT e) as linkedEntities
    `, params)

    const stats = {
      totalEntities: 0,
      totalFiles: 0,
      totalProjects: 0,
      linkedEntities: 0,
      entityTypes: {} as Record<string, number>
    }

    // Process main stats
    if (result.records.length > 0) {
      const record = result.records[0]
      stats.totalEntities = record.get('totalEntities').toNumber ? record.get('totalEntities').toNumber() : record.get('totalEntities')
      stats.totalFiles = record.get('totalFiles').toNumber ? record.get('totalFiles').toNumber() : record.get('totalFiles')
      stats.totalProjects = record.get('totalProjects').toNumber ? record.get('totalProjects').toNumber() : record.get('totalProjects')
      
      const types = record.get('entityTypes') || []
      for (const type of types) {
        stats.entityTypes[type] = (stats.entityTypes[type] || 0) + 1
      }
    }

    // Process linked entities
    if (linkedResult.records.length > 0) {
      stats.linkedEntities = linkedResult.records[0].get('linkedEntities').toNumber ? 
        linkedResult.records[0].get('linkedEntities').toNumber() : 
        linkedResult.records[0].get('linkedEntities')
    }

    // Get language distribution instead of entity types
    const langResult = await session.run(`
      MATCH (e:CodeEntity)
      WHERE ${ownershipFilter}
      RETURN e.language as language, COUNT(e) as count
      ORDER BY count DESC
    `, params)

    const languageDistribution: Record<string, number> = {}
    for (const record of langResult.records) {
      const language = record.get('language') || 'unknown'
      const count = record.get('count')
      languageDistribution[language] = count.toNumber ? count.toNumber() : count
    }

    return NextResponse.json({ 
      stats: {
        ...stats,
        languageDistribution
      }
    })
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