import { NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function GET() {
  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })

    // Generate embedding for "MCP"
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-large',
      input: 'MCP',
      dimensions: 3072,
    })

    const embedding = embeddingResponse.data[0].embedding

    return NextResponse.json({
      success: true,
      model: 'text-embedding-3-large',
      dimensions: 3072,
      embeddingLength: embedding.length,
      // First 10 values of the embedding for comparison
      first10Values: embedding.slice(0, 10),
      apiKeyPresent: !!process.env.OPENAI_API_KEY,
      apiKeyPrefix: process.env.OPENAI_API_KEY?.substring(0, 10)
    })
  } catch (error: any) {
    return NextResponse.json({ 
      error: 'Embedding generation failed',
      details: error.message,
      apiKeyPresent: !!process.env.OPENAI_API_KEY
    }, { status: 500 })
  }
}