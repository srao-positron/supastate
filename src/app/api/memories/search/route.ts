import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { z } from 'zod'

const SearchSchema = z.object({
  teamId: z.string().uuid(),
  query: z.string(),
  embedding: z.array(z.number()).length(1536),
  projectFilter: z.array(z.string()).optional(),
  limit: z.number().min(1).max(100).default(10),
})

export async function POST(request: NextRequest) {
  try {
    // Validate API key
    const apiKey = request.headers.get('x-api-key')
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing API key' }, { status: 401 })
    }

    // Parse request
    const body = await request.json()
    const { teamId, query, embedding, projectFilter, limit } = SearchSchema.parse(body)

    // Initialize Supabase client
    const supabase = await createServiceClient()

    // Verify API key
    const { data: apiKeyData, error: apiKeyError } = await supabase
      .from('api_keys')
      .select('team_id')
      .eq('key_hash', apiKey) // In production, proper hash comparison
      .eq('is_active', true)
      .single()

    if (apiKeyError || apiKeyData?.team_id !== teamId) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }

    // Call the search function
    const { data: searchResults, error: searchError } = await supabase
      .rpc('search_memories', {
        p_team_id: teamId,
        p_query_embedding: embedding,
        p_limit: limit,
        p_project_filter: projectFilter || null,
      })

    if (searchError) {
      console.error('Search error:', searchError)
      return NextResponse.json({ 
        error: 'Search failed' 
      }, { status: 500 })
    }

    return NextResponse.json({
      query,
      results: searchResults || [],
      count: searchResults?.length || 0,
    })
  } catch (error) {
    console.error('Memory search error:', error)
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}