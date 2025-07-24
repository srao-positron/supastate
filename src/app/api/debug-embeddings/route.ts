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

    // Test 1: Check if embeddings exist at all
    const { data: embeddingCheck, error: checkError } = await supabase
      .from('memories')
      .select('id, embedding')
      .not('embedding', 'is', null)
      .limit(5)

    // Test 2: Check embedding dimensions
    const embeddingLengths = embeddingCheck?.map(m => ({
      id: m.id,
      embeddingLength: m.embedding?.length || 0,
      embeddingType: typeof m.embedding,
      isArray: Array.isArray(m.embedding),
      sample: Array.isArray(m.embedding) ? m.embedding.slice(0, 3) : 'not an array'
    }))

    // Test 3: Try direct SQL query for text search
    const { data: textSearch, error: textError } = await supabase
      .from('memories')
      .select('id, content, embedding')
      .ilike('content', '%MCP%')
      .limit(3)

    // Test 4: Check if match_memories function exists with proper signature
    const { data: functionTest, error: funcError } = await supabase.rpc(
      'match_memories',
      {
        query_embedding: JSON.stringify([0, 0, 0]), // Test with string
        match_threshold: 0.5,
        match_count: 1
      }
    )

    // Test 5: Generate embedding for MCP and check format
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-large',
      input: 'MCP',
      dimensions: 3072,
    })
    const mcpEmbedding = embeddingResponse.data[0].embedding

    return NextResponse.json({
      embeddingsExist: {
        count: embeddingCheck?.length || 0,
        error: checkError?.message,
        lengths: embeddingLengths
      },
      textSearchResults: {
        count: textSearch?.length || 0,
        hasEmbeddings: textSearch?.map(m => ({
          id: m.id,
          contentPreview: m.content?.substring(0, 50),
          hasEmbedding: !!m.embedding,
          embeddingLength: m.embedding?.length
        })),
        error: textError?.message
      },
      functionFormatTest: {
        error: funcError?.message,
        errorCode: funcError?.code,
        result: functionTest
      },
      generatedEmbedding: {
        length: mcpEmbedding.length,
        first5: mcpEmbedding.slice(0, 5),
        type: typeof mcpEmbedding,
        isArray: Array.isArray(mcpEmbedding)
      }
    })
  } catch (error: any) {
    return NextResponse.json({ 
      error: 'Test error',
      details: error.message,
      stack: error.stack
    }, { status: 500 })
  }
}