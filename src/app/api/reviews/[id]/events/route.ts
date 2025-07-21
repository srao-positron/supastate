import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const sessionId = params.id
  
  // Verify authentication
  const bearerToken = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!bearerToken) {
    return NextResponse.json({ error: 'Missing authentication' }, { status: 401 })
  }

  const supabase = await createServiceClient()
  
  // Verify user has access to this review session
  const { data: { user }, error: authError } = await supabase.auth.getUser(bearerToken)
  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }
  
  // Check if user's team owns this review session
  const { data: session, error: sessionError } = await supabase
    .from('review_sessions')
    .select('team_id')
    .eq('id', sessionId)
    .single()
  
  if (sessionError || !session) {
    return NextResponse.json({ error: 'Review session not found' }, { status: 404 })
  }
  
  const { data: teamMember } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('user_id', user.id)
    .eq('team_id', session.team_id)
    .single()
  
  if (!teamMember) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // Set up Server-Sent Events
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection message
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'connected', sessionId })}\n\n`)
      )

      // In a real implementation, this would subscribe to a message queue
      // or database changes and stream events as they occur
      // For now, we'll just send a heartbeat every 30 seconds
      const interval = setInterval(() => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: new Date().toISOString() })}\n\n`)
        )
      }, 30000)

      // Clean up on close
      request.signal.addEventListener('abort', () => {
        clearInterval(interval)
        controller.close()
      })
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}