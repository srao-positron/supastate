import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function GET() {
  try {
    // Use service role to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    // First, let's check what embedding dimensions we have in the database
    const { data: sampleMemory, error: sampleError } = await supabase
      .from('memories')
      .select('id, embedding')
      .not('embedding', 'is', null)
      .limit(1)
      .single()

    if (sampleError || !sampleMemory) {
      return NextResponse.json({ error: 'No memories with embeddings found' })
    }

    const dbEmbeddingLength = sampleMemory.embedding?.length || 0

    // Generate embeddings with different models to test
    const models = [
      { name: 'text-embedding-3-large', dimensions: 3072 },
      { name: 'text-embedding-3-large', dimensions: 1536 },
      { name: 'text-embedding-3-small', dimensions: 1536 },
      { name: 'text-embedding-ada-002', dimensions: 1536 }
    ]

    const results = []

    for (const model of models) {
      try {
        const config: any = {
          model: model.name,
          input: 'MCP'
        }
        
        if (model.name === 'text-embedding-3-large' && model.dimensions !== 3072) {
          config.dimensions = model.dimensions
        }

        const embeddingResponse = await openai.embeddings.create(config)
        const embedding = embeddingResponse.data[0].embedding

        // Try to match with this embedding
        const { data: matches, error: matchError } = await supabase.rpc(
          'match_memories',
          {
            query_embedding: embedding,
            match_threshold: 0.5, // Lower threshold
            match_count: 5,
            filter_team_id: null,
            filter_user_id: null,
            filter_projects: null,
          }
        )

        results.push({
          model: model.name,
          dimensions: model.dimensions,
          embeddingLength: embedding.length,
          matchCount: matches?.length || 0,
          error: matchError?.message,
          topMatch: matches?.[0] ? {
            similarity: matches[0].similarity,
            content: matches[0].content?.substring(0, 100)
          } : null
        })
      } catch (e: any) {
        results.push({
          model: model.name,
          dimensions: model.dimensions,
          error: e.message
        })
      }
    }

    // Also test with text search
    const { data: textResults } = await supabase
      .from('memories')
      .select('id, content')
      .ilike('content', '%MCP%')
      .limit(5)

    return NextResponse.json({
      databaseEmbeddingDimensions: dbEmbeddingLength,
      sampleMemoryId: sampleMemory.id,
      embeddingTests: results,
      textSearchCount: textResults?.length || 0,
      textSearchSample: textResults?.[0]
    })
  } catch (error: any) {
    return NextResponse.json({ 
      error: 'Test error',
      details: error.message
    }, { status: 500 })
  }
}