import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { neo4jService } from '@/lib/neo4j/service'
import { getOwnershipFilter, getOwnershipParams } from '@/lib/neo4j/query-patterns'

export async function GET(
  request: Request,
  { params }: { params: { type: string; id: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const { type, id } = params
    
    // Validate type
    if (!['memory', 'code'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid content type. Must be "memory" or "code"' },
        { status: 400 }
      )
    }
    
    // Get user's team context
    const { data: profile } = await supabase
      .from('profiles')
      .select('team_id')
      .eq('id', user.id)
      .single()
    
    const context = {
      userId: user.id,
      workspaceId: profile?.team_id ? `team:${profile.team_id}` : `user:${user.id}`,
      teamId: profile?.team_id
    }
    
    // Fetch the content from Neo4j
    const nodeType = type === 'memory' ? 'Memory' : 'CodeEntity'
    
    const result = await neo4jService.executeQuery(`
      MATCH (n:${nodeType})
      WHERE n.id = $id
        AND ${getOwnershipFilter({ ...context, nodeAlias: 'n' })}
      
      // Get relationships
      OPTIONAL MATCH (n)-[r]-(related)
      WHERE related:Memory OR related:CodeEntity OR related:Pattern
      
      // Get session info for memories
      OPTIONAL MATCH (n)-[:IN_SESSION]->(session:Session)
      WHERE $nodeType = 'Memory'
      
      RETURN n as entity,
             collect(DISTINCT {
               id: related.id,
               type: labels(related)[0],
               relationship: type(r),
               title: CASE 
                 WHEN related:Memory THEN related.title
                 WHEN related:CodeEntity THEN related.path
                 WHEN related:Pattern THEN related.name
                 ELSE null
               END,
               snippet: CASE
                 WHEN related:Memory OR related:CodeEntity THEN 
                   substring(COALESCE(related.content, ''), 0, 200)
                 ELSE null
               END
             }) as relationships,
             session
    `, {
      id,
      nodeType,
      ...getOwnershipParams(context)
    })
    
    if (result.records.length === 0) {
      return NextResponse.json(
        { error: 'Content not found' },
        { status: 404 }
      )
    }
    
    const record = result.records[0]
    const entity = record.entity
    const relationships = record.relationships
    const session = record.session
    
    // Build response based on type
    const response: any = {
      id: entity.properties.id,
      type,
      content: entity.properties.content,
      created_at: entity.properties.created_at,
      relationships: relationships.filter((r: any) => r.id !== null)
    }
    
    if (type === 'memory') {
      response.title = entity.properties.title || 'Untitled Memory'
      response.occurred_at = entity.properties.occurred_at
      response.session = session ? {
        id: session.properties.id,
        started_at: session.properties.started_at,
        ended_at: session.properties.ended_at
      } : null
    } else {
      response.path = entity.properties.path
      response.language = entity.properties.language
      response.project = entity.properties.project
    }
    
    return NextResponse.json(response)
  } catch (error) {
    console.error('Content fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch content', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}