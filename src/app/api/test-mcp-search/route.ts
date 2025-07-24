import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function GET() {
  try {
    const supabase = await createClient()
    
    // Get user info
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's team
    const { data: teamMembers } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('user_id', user.id)
      .limit(1)

    const teamId = teamMembers?.[0]?.team_id

    // Generate embedding for "MCP"
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-large',
      input: 'MCP',
      dimensions: 3072,
    })

    const queryEmbedding = embeddingResponse.data[0].embedding

    // Test the exact same RPC call as the API
    const { data: searchResults, error: searchError } = await supabase.rpc(
      'match_memories',
      {
        query_embedding: queryEmbedding,
        match_threshold: 0.7,
        match_count: 20,
        filter_team_id: teamId,
        filter_user_id: user.id,
        filter_projects: null,
      }
    )

    // Also test without any filters to see raw results
    const { data: noFilterResults, error: noFilterError } = await supabase.rpc(
      'match_memories',
      {
        query_embedding: queryEmbedding,
        match_threshold: 0.7,
        match_count: 20,
        filter_team_id: null,
        filter_user_id: null,
        filter_projects: null,
      }
    )

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        teamId
      },
      withFilters: {
        count: searchResults?.length || 0,
        error: searchError?.message,
        results: searchResults?.slice(0, 3)
      },
      noFilters: {
        count: noFilterResults?.length || 0,
        error: noFilterError?.message,
        results: noFilterResults?.slice(0, 3)
      }
    })
  } catch (error: any) {
    return NextResponse.json({ 
      error: 'Test error',
      details: error.message
    }, { status: 500 })
  }
}