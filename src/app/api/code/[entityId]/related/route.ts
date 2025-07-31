import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { neo4jService } from '@/lib/neo4j/service'
import { getOwnershipFilter, getOwnershipParams } from '@/lib/neo4j/query-patterns'
import { log } from '@/lib/logger'

export async function GET(
  request: NextRequest,
  { params }: { params: { entityId: string } }
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

    const entityId = params.entityId
    
    // Get the code entity and its relationships
    const ownershipFilter = getOwnershipFilter({ 
      userId: user.id, 
      workspaceId,
      nodeAlias: 'c' 
    })
    
    const ownershipParams = getOwnershipParams({ 
      userId: user.id, 
      workspaceId 
    })

    // Get related content for code entities
    const relatedQuery = `
      MATCH (c:CodeEntity {id: $entityId})
      WHERE ${ownershipFilter}
      
      // Get other entities in the same file
      OPTIONAL MATCH (sameFile:CodeEntity)
      WHERE sameFile.file_path = c.file_path 
        AND sameFile.id <> c.id
        AND ${getOwnershipFilter({ userId: user.id, workspaceId, nodeAlias: 'sameFile' })}
      WITH c, collect(DISTINCT {
        type: 'same_file',
        node: sameFile,
        relationship: CASE 
          WHEN sameFile.line_start < c.line_start THEN 'before'
          ELSE 'after'
        END
      })[..10] as sameFileEntities
      
      // Get entities that this one imports
      OPTIONAL MATCH (c)-[r:IMPORTS]->(related:CodeEntity)
      WHERE ${getOwnershipFilter({ userId: user.id, workspaceId, nodeAlias: 'related' })}
      WITH c, sameFileEntities, collect(DISTINCT {
        type: 'dependency',
        node: related,
        relationshipType: type(r)
      })[..5] as dependencies
      
      // Get entities that import this one
      OPTIONAL MATCH (caller:CodeEntity)-[:IMPORTS]->(c)
      WHERE ${getOwnershipFilter({ userId: user.id, workspaceId, nodeAlias: 'caller' })}
      WITH c, sameFileEntities, dependencies, collect(DISTINCT {
        type: 'usage',
        node: caller
      })[..5] as usages
      
      // Get memories that reference this code
      OPTIONAL MATCH (m:Memory)-[:REFERENCES_CODE]->(c)
      WHERE ${getOwnershipFilter({ userId: user.id, workspaceId, nodeAlias: 'm' })}
      WITH c, sameFileEntities, dependencies, usages, collect(DISTINCT {
        type: 'memory',
        node: m
      })[..5] as memories
      
      // Get functions/classes defined by this module
      OPTIONAL MATCH (c)-[:DEFINES_FUNCTION|DEFINES_CLASS]->(defined)
      WHERE (defined:Function OR defined:Class)
      WITH c, sameFileEntities, dependencies, usages, memories, 
           collect(DISTINCT defined) as definitions
      
      RETURN c, sameFileEntities, dependencies, usages, memories, definitions
    `

    const result = await neo4jService.executeQuery(relatedQuery, {
      ...ownershipParams,
      entityId
    })

    if (result.records.length === 0) {
      return NextResponse.json({ error: 'Code entity not found' }, { status: 404 })
    }

    const record = result.records[0]
    const codeEntity = record.c
    
    // Log the raw record to debug
    log.info('Code related query results', {
      entityId,
      hasRecord: !!record,
      recordKeys: record ? Object.keys(record) : [],
      hasCodeEntity: !!codeEntity,
      codeEntityPath: codeEntity?.path || codeEntity?.file_path,
      sameFileCount: record?.sameFileEntities?.length || 0,
      dependenciesCount: record?.dependencies?.length || 0,
      usagesCount: record?.usages?.length || 0,
      memoriesCount: record?.memories?.length || 0,
      definitionsCount: record?.definitions?.length || 0
    })
    
    // Process same file entities to separate before/after
    const sameFileEntities = record.sameFileEntities || []
    const beforeInFile = sameFileEntities
      .filter((e: any) => e && e.node && e.relationship === 'before')
      .sort((a: any, b: any) => ((b.node?.line_end || b.node?.properties?.line_end) || 0) - ((a.node?.line_end || a.node?.properties?.line_end) || 0))
      .map((e: any) => e.node?.properties || e.node)
      .filter(Boolean)
    
    const afterInFile = sameFileEntities
      .filter((e: any) => e && e.node && e.relationship === 'after')
      .sort((a: any, b: any) => ((a.node?.line_start || a.node?.properties?.line_start) || 0) - ((b.node?.line_start || b.node?.properties?.line_start) || 0))
      .map((e: any) => e.node?.properties || e.node)
      .filter(Boolean)

    // Format the response
    const related = {
      definitions: (record.definitions || [])
        .filter((d: any) => d)
        .map((d: any) => {
          const props = d.properties || d
          // Add type information for functions and classes
          return {
            ...props,
            nodeType: d.labels?.[0] || 'unknown',
            // For display, use the name or fall back to type
            displayName: props.name || `${d.labels?.[0] || 'Item'}`
          }
        }),
      sameFile: {
        before: beforeInFile.slice(0, 3),
        after: afterInFile.slice(0, 3)
      },
      dependencies: (record.dependencies || [])
        .filter((d: any) => d && d.node)
        .map((d: any) => ({
          ...(d.node.properties || d.node),
          relationshipType: d.relationshipType
        })),
      usages: (record.usages || [])
        .filter((u: any) => u && u.node)
        .map((u: any) => u.node.properties || u.node),
      memories: (record.memories || [])
        .filter((m: any) => m && m.node)
        .map((m: any) => m.node.properties || m.node)
    }

    log.info('Fetched related code content', {
      entityId,
      counts: {
        definitions: related.definitions.length,
        beforeInFile: related.sameFile.before.length,
        afterInFile: related.sameFile.after.length,
        dependencies: related.dependencies.length,
        usages: related.usages.length,
        memories: related.memories.length
      }
    })

    return NextResponse.json({ related })

  } catch (error) {
    log.error('Failed to get related code entities', error)
    return NextResponse.json(
      { error: 'Failed to get related content' }, 
      { status: 500 }
    )
  }
}