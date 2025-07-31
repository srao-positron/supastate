import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { neo4jService } from '@/lib/neo4j/service'
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

    const entityId = params.entityId

    // Initialize Neo4j service
    try {
      await neo4jService.initialize()
    } catch (initError) {
      log.error('Failed to initialize Neo4j', initError, {
        service: 'CodeEntityContent',
        entityId
      })
      return NextResponse.json({ error: 'Database connection failed' }, { status: 503 })
    }

    // Fetch code entity with file content
    const result = await neo4jService.executeQuery(`
      MATCH (e:CodeEntity {id: $entityId})
      OPTIONAL MATCH (e)-[:DEFINED_IN]->(f:CodeFile)
      RETURN e {
        .id,
        .name,
        .type,
        .signature,
        .line_start,
        .line_end,
        .metadata,
        .content,
        file: f {
          .id,
          .path,
          .language,
          .content
        }
      } as entity
    `, {
      entityId
    })

    if (result.records.length === 0) {
      return NextResponse.json({ error: 'Code entity not found' }, { status: 404 })
    }

    const entity = result.records[0].entity
    let content = ''

    // Extract relevant code from file content
    if (entity.file?.content && entity.line_start && entity.line_end) {
      const lines = entity.file.content.split('\n')
      const startLine = Math.max(0, entity.line_start - 1)
      const endLine = Math.min(lines.length, entity.line_end)
      content = lines.slice(startLine, endLine).join('\n')
    } else if (entity.content) {
      // Use entity's own content if available
      content = entity.content
    } else if (entity.signature) {
      // Fallback to signature if no content
      content = entity.signature
    }

    log.info('Code entity content retrieved', {
      service: 'CodeEntityContent',
      entityId,
      hasContent: !!content,
      contentLength: content.length
    })

    return NextResponse.json({ 
      content,
      language: entity.file?.language || 'typescript',
      lineStart: entity.line_start,
      lineEnd: entity.line_end
    })

  } catch (error) {
    log.error('Failed to get code entity content', error, {
      service: 'CodeEntityContent',
      entityId: params.entityId
    })
    return NextResponse.json(
      { error: 'Failed to retrieve code entity content' }, 
      { status: 500 }
    )
  }
}