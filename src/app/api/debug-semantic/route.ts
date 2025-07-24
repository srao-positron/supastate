import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    // Create TWO clients - one with anon key, one with service role
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Simple test embedding (just first 10 values repeated)
    const testEmbedding = new Array(3072).fill(0).map((_, i) => i < 10 ? 0.1 * (i + 1) : 0)

    // Test with anon client (has RLS)
    const { data: anonResults, error: anonError } = await anonClient.rpc(
      'match_memories',
      {
        query_embedding: testEmbedding,
        match_threshold: 0.1,
        match_count: 5,
        filter_team_id: null,
        filter_user_id: null,
        filter_projects: null
      }
    )

    // Test with service client (bypasses RLS)
    const { data: serviceResults, error: serviceError } = await serviceClient.rpc(
      'match_memories',
      {
        query_embedding: testEmbedding,
        match_threshold: 0.1,
        match_count: 5,
        filter_team_id: null,
        filter_user_id: null,
        filter_projects: null
      }
    )

    return NextResponse.json({
      anonClient: {
        resultsCount: anonResults?.length || 0,
        error: anonError?.message,
        firstResult: anonResults?.[0]
      },
      serviceClient: {
        resultsCount: serviceResults?.length || 0,
        error: serviceError?.message,
        firstResult: serviceResults?.[0]
      }
    })
  } catch (error: any) {
    return NextResponse.json({ 
      error: 'Test error',
      details: error.message
    }, { status: 500 })
  }
}