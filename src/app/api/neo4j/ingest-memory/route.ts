import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { log } from '@/lib/logger'

export async function POST(request: NextRequest) {
  let user: any = null
  let body: any = null
  
  try {
    const supabase = await createClient()
    
    // Check authentication
    const authResult = await supabase.auth.getUser()
    user = authResult.data.user
    const authError = authResult.error
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get request body
    body = await request.json()
    const { 
      content, 
      project_name, 
      type = 'general',
      metadata = {},
      file_paths = [],
      topics = [],
      entities_mentioned = [],
      tools_used = [],
      occurred_at
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
    const workspaceId = teamId ? `team:${teamId}` : `user:${user.id}`

    log.info('Preparing memory ingestion', {
      userId: user.id,
      teamId,
      workspaceId,
      projectName: project_name,
      hasOccurredAt: !!occurred_at,
      occurredAt: occurred_at,
      contentLength: content.length
    })

    // First create the memory in Supabase
    const memoryData = {
      content,
      project_name,
      user_id: user.id,
      team_id: teamId,
      workspace_id: teamId ? `team:${teamId}` : `user:${user.id}`,
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
      chunk_id: body.chunk_id,
      occurred_at: occurred_at || new Date().toISOString()
    }

    // Insert into memories table
    const { data: memory, error: memoryError } = await supabase
      .from('memories')
      .insert(memoryData)
      .select()
      .single()

    if (memoryError || !memory) {
      throw new Error(`Failed to create memory: ${memoryError?.message || 'Unknown error'}`)
    }

    // Queue the memory for async ingestion into Neo4j
    const { data: msgId, error: queueError } = await supabase.rpc('queue_memory_ingestion_job', {
      p_memory_id: memory.id,
      p_user_id: user.id,
      p_content: content,
      p_workspace_id: workspaceId,
      p_metadata: memoryData.metadata
    })

    if (queueError) {
      log.error('Failed to queue memory ingestion', {
        error: queueError.message,
        memoryId: memory.id
      })
      // Don't fail the request - memory is saved in Supabase
    }

    log.info('Memory created and queued for ingestion', {
      memoryId: memory.id,
      projectName: memory.project_name,
      userId: user.id,
      workspaceId: memory.workspace_id,
      queueMsgId: msgId,
      occurredAt: memory.occurred_at,
      createdAt: memory.created_at,
      type: memory.type
    })

    return NextResponse.json({
      success: true,
      memory: {
        id: memory.id,
        project_name: memory.project_name,
        created_at: memory.created_at
      },
      queued: !!msgId
    })

  } catch (error) {
    log.error('Memory ingestion API error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      userId: user?.id,
      projectName: body?.project_name,
      hasContent: !!body?.content,
      contentLength: body?.content?.length
    })
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
            // First create memory in Supabase
            const memoryData = {
              ...memory,
              user_id: memory.user_id || user.id,
              team_id: memory.team_id || teamId,
              workspace_id: memory.workspace_id || (teamId ? `team:${teamId}` : `user:${user.id}`),
              occurred_at: memory.occurred_at || new Date().toISOString()
            }

            const { data: savedMemory, error: saveError } = await supabase
              .from('memories')
              .insert(memoryData)
              .select()
              .single()

            if (saveError || !savedMemory) {
              throw new Error(`Failed to save memory: ${saveError?.message}`)
            }

            // Queue for async Neo4j ingestion
            const { data: msgId, error: queueError } = await supabase.rpc('queue_memory_ingestion_job', {
              p_memory_id: savedMemory.id,
              p_user_id: savedMemory.user_id,
              p_content: savedMemory.content,
              p_workspace_id: savedMemory.workspace_id,
              p_metadata: savedMemory.metadata || {}
            })

            if (queueError) {
              log.warn('Failed to queue memory', { error: queueError.message, memoryId: savedMemory.id })
            }

            results.push({ success: true, id: savedMemory.id, queued: !!msgId })
          } catch (error) {
            log.error('Failed to ingest memory in batch', error, {
              memoryIndex: i + batch.indexOf(memory),
              userId: memory.user_id || user.id
            })
            results.push({ success: false, error: String(error) })
          }
        })
      )
    }

    const successCount = results.filter(r => r.success).length
    log.info('Batch ingestion complete', {
      total: memories.length,
      successful: successCount,
      failed: memories.length - successCount
    })

    return NextResponse.json({
      success: true,
      total: memories.length,
      successful: successCount,
      failed: memories.length - successCount,
      results
    })

  } catch (error) {
    log.error('Batch ingestion API error', error)
    return NextResponse.json(
      { error: 'Failed to ingest memories' }, 
      { status: 500 }
    )
  }
}