import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q') || 'MCP'
    
    // Use service role to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Generate embedding
    console.log('Generating embedding for:', query)
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-large',
      input: query,
      dimensions: 3072,
    })
    const embedding = embeddingResponse.data[0].embedding
    const embeddingJson = JSON.stringify(embedding)

    // Test match_memories directly
    console.log('Testing match_memories...')
    const { data: results, error } = await supabase.rpc('match_memories', {
      query_embedding: embeddingJson,
      match_threshold: 0.5,
      match_count: 10,
      filter_user_id: 'a02c3fed-3a24-442f-becc-97bac8b75e90',
      filter_team_id: null,
      filter_projects: null
    })

    if (error) {
      console.error('RPC error:', error)
      return NextResponse.json({ 
        error: 'RPC failed', 
        details: error.message,
        code: error.code,
        hint: error.hint
      }, { status: 500 })
    }

    // Also test text search for comparison
    const { data: textResults, error: textError } = await supabase
      .from('memories')
      .select('id, content, project_name')
      .ilike('content', `%${query}%`)
      .limit(5)

    return NextResponse.json({
      query,
      semanticResults: {
        count: results?.length || 0,
        results: results?.slice(0, 3).map((r: any) => ({
          id: r.id,
          project: r.project_name,
          similarity: r.similarity,
          preview: r.content?.substring(0, 100)
        }))
      },
      textResults: {
        count: textResults?.length || 0,
        results: textResults?.slice(0, 3).map((r: any) => ({
          id: r.id,
          project: r.project_name,
          preview: r.content?.substring(0, 100)
        }))
      },
      embeddingInfo: {
        length: embedding.length,
        jsonLength: embeddingJson.length,
        first3: embedding.slice(0, 3)
      }
    })
  } catch (error: any) {
    console.error('Debug endpoint error:', error)
    return NextResponse.json({ 
      error: 'Debug error',
      message: error.message,
      stack: error.stack
    }, { status: 500 })
  }
}