import { NextResponse } from 'next/server'
import { UnifiedSearchOrchestrator } from '@/lib/search/orchestrator'
import { UnifiedSearchRequest } from '@/lib/search/types'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Get user's team context
    const { data: profile } = await supabase
      .from('profiles')
      .select('team_id')
      .eq('id', user.id)
      .single()
    
    const body: UnifiedSearchRequest = await request.json()
    
    // Validate request
    if (!body.query || typeof body.query !== 'string') {
      return NextResponse.json(
        { error: 'Query is required' }, 
        { status: 400 }
      )
    }
    
    // Build user context
    const context = {
      userId: user.id,
      workspaceId: profile?.team_id ? `team:${profile.team_id}` : `user:${user.id}`,
      teamId: profile?.team_id
    }
    
    console.log('Search API - User context:', context)
    console.log('Search API - Query:', body.query)
    
    // Create orchestrator and execute search
    const orchestrator = new UnifiedSearchOrchestrator()
    const results = await orchestrator.search(body, context)
    
    console.log('Search API - Results count:', results.results?.length || 0)
    
    return NextResponse.json(results)
  } catch (error) {
    console.error('Unified search error:', error)
    return NextResponse.json(
      { error: 'Search failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// OPTIONS for CORS if needed
export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}