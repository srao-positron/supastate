import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { neo4jService } from '@/lib/neo4j/service'
import { getOwnershipFilter, getOwnershipParams } from '@/lib/neo4j/query-patterns'
import { log } from '@/lib/logger'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get workspace info
    const { data: teamMembers } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('user_id', user.id)
      .limit(1)

    const workspaceId = teamMembers?.[0]?.team_id 
      ? `team:${teamMembers[0].team_id}` 
      : `user:${user.id}`

    // Initialize Neo4j
    await neo4jService.initialize()

    const memoryId = params.id
    
    // Get the memory and its relationships
    const ownershipFilter = getOwnershipFilter({ 
      userId: user.id, 
      workspaceId,
      nodeAlias: 'm' 
    })
    
    const ownershipParams = getOwnershipParams({ 
      userId: user.id, 
      workspaceId 
    })

    // First, check if this memory exists and belongs to the user
    const memoryCheckQuery = `
      MATCH (m:Memory {id: $memoryId})
      WHERE ${ownershipFilter}
      RETURN m
    `
    
    const memoryResult = await neo4jService.executeQuery(memoryCheckQuery, {
      ...ownershipParams,
      memoryId
    })

    if (memoryResult.records.length === 0) {
      return NextResponse.json({ error: 'Memory not found' }, { status: 404 })
    }

    // Now get related content in multiple categories
    const relatedQuery = `
      MATCH (m:Memory {id: $memoryId})
      WHERE ${ownershipFilter}
      
      // Get memories from same time window (within 30 minutes)
      OPTIONAL MATCH (related:Memory)
      WHERE related.id <> m.id
        AND ${getOwnershipFilter({ userId: user.id, workspaceId, nodeAlias: 'related' })}
        AND related.occurred_at IS NOT NULL
        AND m.occurred_at IS NOT NULL
        AND abs(datetime(related.occurred_at).epochSeconds - datetime(m.occurred_at).epochSeconds) < 1800
      WITH m, collect(DISTINCT {
        type: 'temporal',
        node: related,
        relationshipType: 'temporal_proximity'
      })[..5] as temporalRelated
      
      // Get memories that reference the same code
      OPTIONAL MATCH (m)-[:REFERENCES_CODE]->(code:CodeEntity)<-[:REFERENCES_CODE]-(similar:Memory)
      WHERE similar.id <> m.id 
        AND ${getOwnershipFilter({ userId: user.id, workspaceId, nodeAlias: 'similar' })}
      WITH m, temporalRelated, collect(DISTINCT {
        type: 'code_context',
        node: similar,
        concept: code.path
      })[..5] as conceptualRelated
      
      // Get semantically similar memories via EntitySummary
      OPTIONAL MATCH (m)<-[:SUMMARIZES]-(mSummary:EntitySummary)
      WHERE mSummary.embedding IS NOT NULL
      WITH m, temporalRelated, conceptualRelated, mSummary
      
      OPTIONAL MATCH (sSummary:EntitySummary)-[:SUMMARIZES]->(similar:Memory)
      WHERE similar.id <> m.id 
        AND ${getOwnershipFilter({ userId: user.id, workspaceId, nodeAlias: 'similar' })}
        AND sSummary.embedding IS NOT NULL
        AND mSummary IS NOT NULL
      WITH m, temporalRelated, conceptualRelated, similar, sSummary, mSummary,
           vector.similarity.cosine(mSummary.embedding, sSummary.embedding) as similarity
      WHERE similarity > 0.75
      WITH m, temporalRelated, conceptualRelated, collect(DISTINCT {
        type: 'semantic',
        node: similar,
        similarity: similarity
      })[..5] as semanticRelated
      
      // Get related code entities
      OPTIONAL MATCH (m)-[:REFERENCES_CODE]-(code:CodeEntity)
      WITH m, temporalRelated, conceptualRelated, semanticRelated, collect(DISTINCT {
        type: 'code',
        node: code
      })[..5] as codeRelated
      
      // Get surrounding context (memories from same session)
      OPTIONAL MATCH (context:Memory)
      WHERE context.session_id = m.session_id
        AND m.session_id IS NOT NULL
        AND context.id <> m.id
        AND ${getOwnershipFilter({ userId: user.id, workspaceId, nodeAlias: 'context' })}
      WITH m, temporalRelated, conceptualRelated, semanticRelated, codeRelated,
           context, abs(datetime(context.occurred_at).epochSeconds - datetime(m.occurred_at).epochSeconds) as timeDiff
      ORDER BY timeDiff
      WITH m, temporalRelated, conceptualRelated, semanticRelated, codeRelated,
           collect(DISTINCT {
             type: 'context',
             node: context,
             timeDiff: timeDiff,
             isBefore: datetime(context.occurred_at) < datetime(m.occurred_at)
           })[..10] as contextRelated
      
      RETURN m, temporalRelated, conceptualRelated, semanticRelated, codeRelated, contextRelated
    `

    const result = await neo4jService.executeQuery(relatedQuery, {
      ...ownershipParams,
      memoryId
    })

    if (result.records.length === 0) {
      return NextResponse.json({ 
        related: {
          temporal: [],
          conceptual: [],
          semantic: [],
          code: [],
          context: { before: [], after: [] }
        }
      })
    }

    const record = result.records[0]
    
    // Log what we're getting
    log.info('Memory related query results', {
      memoryId,
      hasRecord: !!record,
      recordKeys: record ? Object.keys(record) : [],
      temporalCount: record?.temporalRelated?.length || 0,
      conceptualCount: record?.conceptualRelated?.length || 0,
      semanticCount: record?.semanticRelated?.length || 0,
      codeCount: record?.codeRelated?.length || 0,
      contextCount: record?.contextRelated?.length || 0
    })
    
    // Process context to separate before/after
    const contextRelated = record.contextRelated || []
    const contextBefore = contextRelated
      .filter((c: any) => c && c.node && c.isBefore)
      .map((c: any) => ({
        ...(c.node.properties || c.node),
        timeDiff: c.timeDiff
      }))
    
    const contextAfter = contextRelated
      .filter((c: any) => c && c.node && !c.isBefore)
      .map((c: any) => ({
        ...(c.node.properties || c.node),
        timeDiff: c.timeDiff
      }))

    // Format the response
    const related = {
      temporal: (record.temporalRelated || [])
        .filter((r: any) => r && r.node)
        .map((r: any) => ({
          ...(r.node.properties || r.node),
          relationshipType: r.relationshipType
        })),
      conceptual: (record.conceptualRelated || [])
        .filter((r: any) => r && r.node)
        .map((r: any) => ({
          ...(r.node.properties || r.node),
          concept: r.concept
        })),
      semantic: (record.semanticRelated || [])
        .filter((r: any) => r && r.node)
        .map((r: any) => ({
          ...(r.node.properties || r.node),
          similarity: r.similarity
        })),
      code: (record.codeRelated || [])
        .filter((r: any) => r && r.node)
        .map((r: any) => ({
          ...(r.node.properties || r.node)
        })),
      context: {
        before: contextBefore,
        after: contextAfter
      }
    }

    log.info('Fetched related content', {
      memoryId,
      counts: {
        temporal: related.temporal.length,
        conceptual: related.conceptual.length,
        semantic: related.semantic.length,
        code: related.code.length,
        contextBefore: related.context.before.length,
        contextAfter: related.context.after.length
      }
    })

    return NextResponse.json({ related })

  } catch (error) {
    log.error('Failed to get related memories', error)
    return NextResponse.json(
      { error: 'Failed to get related content' }, 
      { status: 500 }
    )
  }
}