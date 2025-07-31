import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { log } from '@/lib/logger'

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
      pattern_types = ['debugging', 'learning', 'refactoring', 'temporal', 'semantic', 'memory_code'],
      limit = 100
    } = body

    // Get user's team if they have one
    const { data: teamMembers } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('user_id', user.id)
      .limit(1)

    const teamId = teamMembers?.[0]?.team_id
    const workspaceId = teamId ? `team:${teamId}` : `user:${user.id}`

    log.info('User-triggered pattern detection', {
      userId: user.id,
      teamId,
      workspaceId,
      patternTypes: pattern_types
    })

    // Queue the pattern detection job
    const { data: msgId, error: queueError } = await supabase.rpc('queue_pattern_detection_job', {
      p_batch_id: crypto.randomUUID(),
      p_pattern_types: pattern_types,
      p_limit: limit,
      p_workspace_id: workspaceId
    })

    if (queueError) {
      log.error('Failed to queue pattern detection', {
        error: queueError.message,
        userId: user.id,
        workspaceId
      })
      return NextResponse.json(
        { error: 'Failed to queue pattern detection' }, 
        { status: 500 }
      )
    }

    log.info('Pattern detection queued successfully', {
      msgId,
      userId: user.id,
      workspaceId
    })

    // Get current queue status
    const { data: queueHealth } = await supabase
      .from('queue_health')
      .select('*')
      .eq('queue_name', 'pattern_detection')
      .single()

    return NextResponse.json({
      success: true,
      message: 'Pattern detection queued successfully',
      queue_message_id: msgId,
      workspace_id: workspaceId,
      pattern_types: pattern_types,
      queue_status: {
        queue_length: queueHealth?.queue_length || 0,
        oldest_msg_age_sec: queueHealth?.oldest_msg_age_sec || 0
      }
    })

  } catch (error) {
    log.error('Pattern detection API error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })
    return NextResponse.json(
      { error: 'Failed to trigger pattern detection' }, 
      { status: 500 }
    )
  }
}

// GET endpoint to check pattern detection status
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's workspace
    const { data: teamMembers } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('user_id', user.id)
      .limit(1)

    const teamId = teamMembers?.[0]?.team_id
    const workspaceId = teamId ? `team:${teamId}` : `user:${user.id}`

    // Get recent pattern processor logs for this workspace
    const { data: logs } = await supabase
      .from('pattern_processor_logs')
      .select('*')
      .or(`details->workspace_id.eq.${workspaceId},details->workspaces.cs.["${workspaceId}"]`)
      .order('created_at', { ascending: false })
      .limit(20)

    // Get queue status
    const { data: queueHealth } = await supabase
      .from('queue_health')
      .select('*')

    return NextResponse.json({
      workspace_id: workspaceId,
      recent_activity: logs || [],
      queue_status: queueHealth || []
    })

  } catch (error) {
    log.error('Pattern status API error', {
      error: error instanceof Error ? error.message : String(error)
    })
    return NextResponse.json(
      { error: 'Failed to get pattern detection status' }, 
      { status: 500 }
    )
  }
}