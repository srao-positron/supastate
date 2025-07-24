import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get user info
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const { query, projectFilter, limit = 20, threshold = 0.7 } = await request.json()

    console.log('[Semantic Search] Request received:', {
      query,
      projectFilter,
      limit,
      threshold
    })

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

    // Get user's team
    const { data: teamMembers } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('user_id', user.id)
      .limit(1)

    const teamId = teamMembers?.[0]?.team_id

    // Generate embedding for the query
    console.log('[Semantic Search] Generating embedding for query:', query)
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-large',
      input: query,
      dimensions: 3072,
    })

    const queryEmbedding = embeddingResponse.data[0].embedding

    // Perform semantic search
    const { data: searchResults, error: searchError } = await supabase.rpc(
      'match_memories',
      {
        query_embedding: queryEmbedding,
        match_threshold: threshold,
        match_count: limit,
        filter_team_id: teamId,
        filter_user_id: user.id, // Always pass user ID to search personal memories too
        filter_projects: projectFilter && projectFilter.length > 0 ? projectFilter : null,
      }
    )

    if (searchError) {
      console.error('[Semantic Search] Search error:', searchError)
      return NextResponse.json({ error: 'Search failed', details: searchError.message }, { status: 500 })
    }

    // Also get total count for pagination
    const { count } = await supabase
      .from('memories')
      .select('*', { count: 'exact', head: true })
      .or(teamId ? `team_id.eq.${teamId},user_id.eq.${user.id}` : `user_id.eq.${user.id}`)

    console.log('[Semantic Search] Found', searchResults?.length || 0, 'results')

    return NextResponse.json({
      results: searchResults || [],
      total: count || 0,
      hasMore: (searchResults?.length || 0) >= limit,
      searchType: 'semantic',
    })
  } catch (error) {
    console.error('[Semantic Search] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}