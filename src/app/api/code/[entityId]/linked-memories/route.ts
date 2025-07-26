import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDriver } from '@/lib/neo4j/client'
import neo4j from 'neo4j-driver'

export async function GET(
  request: NextRequest,
  { params }: { params: { entityId: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const entityId = params.entityId
    if (!entityId) {
      return NextResponse.json({ error: 'Entity ID is required' }, { status: 400 })
    }

    // Get Neo4j driver
    const driver = getDriver()
    const session = driver.session()

    try {
      // Get user's team IDs
      const { data: teamMembers } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('user_id', user.id)
      
      const teamIds = teamMembers?.map(tm => tm.team_id) || []
      
      // First verify the user has access to this entity
      const accessCheck = await session.run(`
        MATCH (e:CodeEntity {id: $entityId})
        WHERE e.user_id = $userId OR e.team_id IN $teamIds
        RETURN e.id
      `, {
        entityId,
        userId: user.id,
        teamIds
      })

      if (!accessCheck.records.length) {
        return NextResponse.json({ error: 'Entity not found or access denied' }, { status: 404 })
      }

      // Get linked memories with relationships
      const result = await session.run(`
        MATCH (e:CodeEntity {id: $entityId})
        OPTIONAL MATCH (m:Memory)-[r:REFERENCES_CODE|REFERENCES_FILE]->(e)
        WHERE m.id IS NOT NULL
        RETURN 
          m.id as id,
          m.chunk_id as chunkId,
          m.content as content,
          m.created_at as createdAt,
          m.type as type,
          m.metadata as metadata,
          m.session_id as sessionId,
          type(r) as relationshipType,
          CASE 
            WHEN r.similarity IS NOT NULL THEN r.similarity
            ELSE 1.0
          END as similarity,
          r.reference_text as referenceText,
          r.created_at as linkedAt
        ORDER BY similarity DESC, m.created_at DESC
        LIMIT 50
      `, {
        entityId
      })

      const memories = result.records.map(record => {
        const metadata = record.get('metadata')
        return {
          id: record.get('id'),
          chunkId: record.get('chunkId'),
          content: record.get('content'),
          createdAt: record.get('createdAt'),
          type: record.get('type'),
          metadata: metadata ? JSON.parse(metadata) : {},
          sessionId: record.get('sessionId'),
          relationshipType: record.get('relationshipType'),
          similarity: record.get('similarity'),
          referenceText: record.get('referenceText'),
          linkedAt: record.get('linkedAt')
        }
      })

      // Also get memories that reference this entity by name (without explicit link)
      const nameMatchResult = await session.run(`
        MATCH (e:CodeEntity {id: $entityId})
        MATCH (m:Memory)
        WHERE m.content CONTAINS e.name
        AND NOT EXISTS((m)-[:REFERENCES_CODE|REFERENCES_FILE]->(e))
        RETURN 
          m.id as id,
          m.chunk_id as chunkId,
          m.content as content,
          m.created_at as createdAt,
          m.type as type,
          m.metadata as metadata,
          m.session_id as sessionId,
          'NAME_MATCH' as relationshipType,
          0.5 as similarity,
          e.name as referenceText,
          null as linkedAt
        ORDER BY m.created_at DESC
        LIMIT 20
      `, {
        entityId
      })

      const nameMatchMemories = nameMatchResult.records.map(record => {
        const metadata = record.get('metadata')
        return {
          id: record.get('id'),
          chunkId: record.get('chunkId'),
          content: record.get('content'),
          createdAt: record.get('createdAt'),
          type: record.get('type'),
          metadata: metadata ? JSON.parse(metadata) : {},
          sessionId: record.get('sessionId'),
          relationshipType: record.get('relationshipType'),
          similarity: record.get('similarity'),
          referenceText: record.get('referenceText'),
          linkedAt: record.get('linkedAt'),
          isNameMatch: true
        }
      })

      // Combine and deduplicate
      const allMemories = [...memories, ...nameMatchMemories]
      const uniqueMemories = Array.from(
        new Map(allMemories.map(m => [m.id, m])).values()
      )

      return NextResponse.json({
        memories: uniqueMemories,
        total: uniqueMemories.length
      })

    } finally {
      await session.close()
    }

  } catch (error: any) {
    console.error('Error fetching linked memories:', error)
    return NextResponse.json(
      { error: 'Failed to fetch linked memories', details: error.message },
      { status: 500 }
    )
  }
}