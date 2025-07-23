/**
 * Memory search API - returns results even if some are still processing
 */

import { createClient } from '@/lib/supabase/server'
import { verifyApiKey } from '@/lib/auth/api-key'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')
    const limit = parseInt(searchParams.get('limit') || '20')
    const includeProcessing = searchParams.get('includeProcessing') === 'true'
    const project = searchParams.get('project') // Optional project filter
    
    if (!query) {
      return NextResponse.json({ error: 'Query parameter required' }, { status: 400 })
    }
    
    // Verify API key
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing API key' }, { status: 401 })
    }
    
    const apiKey = authHeader.substring(7)
    const authResult = await verifyApiKey(apiKey)
    
    if (!authResult.authenticated) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }
    
    const workspace = authResult.teamId 
      ? `team:${authResult.teamId}`
      : `user:${authResult.userId}`
    
    console.log('[Memory Search] Searching', { workspace, query, limit, project })
    
    // Generate embedding for query
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    })
    
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
      dimensions: 1536,
    })
    
    const queryEmbedding = embeddingResponse.data[0].embedding
    
    // Search in processed memories
    const supabase = await createClient()
    const { data: memories, error } = await supabase
      .rpc('search_memories', {
        query_embedding: queryEmbedding,
        workspace_filter: workspace,
        match_threshold: 0.7,
        match_count: limit,
        project_filter: project || null,
      })
    
    if (error) {
      console.error('[Memory Search] Search error', { error })
      throw error
    }
    
    // Check for items still processing
    let processingCount = 0
    if (includeProcessing) {
      const { count } = await supabase
        .from('memory_queue')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', workspace)
        .eq('status', 'pending')
      
      processingCount = count || 0
    }
    
    // Format results
    const results = memories?.map((m: any) => ({
      chunkId: m.chunk_id,
      content: m.content,
      similarity: m.similarity,
      metadata: m.metadata,
      sessionId: m.session_id,
      projectName: m.project_name,
    })) || []
    
    return NextResponse.json({
      results,
      count: results.length,
      processingCount,
      query,
    })
    
  } catch (error) {
    console.error('[Memory Search] Error', { error })
    return NextResponse.json(
      { error: 'Search failed' },
      { status: 500 }
    )
  }
}