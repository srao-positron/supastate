import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ingestionService } from '@/lib/neo4j/ingestion'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get request body
    const body = await request.json()
    const { 
      content, 
      project_name, 
      type = 'general',
      metadata = {},
      file_paths = [],
      topics = [],
      entities_mentioned = [],
      tools_used = []
    } = body

    if (!content || !project_name) {
      return NextResponse.json(
        { error: 'Content and project_name are required' }, 
        { status: 400 }
      )
    }

    // Get user's team if they have one
    const { data: teamMembers } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('user_id', user.id)
      .limit(1)

    const teamId = teamMembers?.[0]?.team_id

    // Ingest memory into Neo4j
    const memory = await ingestionService.ingestMemory({
      content,
      project_name,
      user_id: user.id,
      team_id: teamId,
      type,
      metadata: {
        ...metadata,
        source: 'api',
        user_email: user.email
      },
      file_paths,
      topics,
      entities_mentioned,
      tools_used,
      session_id: body.session_id,
      chunk_id: body.chunk_id
    })

    console.log(`[API] Memory ingested: ${memory.id}`)

    return NextResponse.json({
      success: true,
      memory: {
        id: memory.id,
        project_name: memory.project_name,
        created_at: memory.created_at
      }
    })

  } catch (error) {
    console.error('[API] Memory ingestion error:', error)
    return NextResponse.json(
      { error: 'Failed to ingest memory' }, 
      { status: 500 }
    )
  }
}

// Batch ingestion endpoint
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // For batch ingestion, require admin role or specific permission
    // This is a placeholder - implement your own authorization logic
    const isAdmin = user.email?.endsWith('@supastate.ai')
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { memories } = await request.json()
    
    if (!Array.isArray(memories)) {
      return NextResponse.json(
        { error: 'memories must be an array' }, 
        { status: 400 }
      )
    }

    // Get user's team
    const { data: teamMembers } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('user_id', user.id)
      .limit(1)

    const teamId = teamMembers?.[0]?.team_id

    // Process memories in parallel batches to avoid overwhelming Neo4j
    const batchSize = 10
    const results: any[] = []
    
    for (let i = 0; i < memories.length; i += batchSize) {
      const batch = memories.slice(i, i + batchSize)
      
      await Promise.all(
        batch.map(async (memory) => {
          try {
            const result = await ingestionService.ingestMemory({
              ...memory,
              user_id: memory.user_id || user.id,
              team_id: memory.team_id || teamId
            })
            results.push({ success: true, id: result.id })
          } catch (error) {
            console.error(`[API] Failed to ingest memory:`, error)
            results.push({ success: false, error: String(error) })
          }
        })
      )
    }

    const successCount = results.filter(r => r.success).length
    console.log(`[API] Batch ingestion complete: ${successCount}/${memories.length} successful`)

    return NextResponse.json({
      success: true,
      total: memories.length,
      successful: successCount,
      failed: memories.length - successCount,
      results
    })

  } catch (error) {
    console.error('[API] Batch ingestion error:', error)
    return NextResponse.json(
      { error: 'Failed to ingest memories' }, 
      { status: 500 }
    )
  }
}