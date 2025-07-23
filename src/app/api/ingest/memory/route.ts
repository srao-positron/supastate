/**
 * Memory ingestion API - accepts raw memory chunks for server-side processing
 */

import { createServiceClient } from '@/lib/supabase/server'
import { verifyApiKey } from '@/lib/auth/api-key'
import { NextResponse } from 'next/server'
import { z } from 'zod'

// Validation schema
const memoryChunkSchema = z.object({
  chunkId: z.string(),
  content: z.string(),
  metadata: z.object({
    timestamp: z.string().optional(),
    filePaths: z.array(z.string()).optional(),
    messageType: z.enum(['user', 'assistant']).optional(),
    hasCode: z.boolean().optional(),
    codeLanguage: z.string().optional(),
    summary: z.string().optional(),
  }).optional(),
})

const requestSchema = z.object({
  sessionId: z.string(),
  projectPath: z.string().optional(),
  chunks: z.array(memoryChunkSchema),
})

export async function POST(request: Request) {
  console.log('[Memory Ingest] Starting ingestion request')
  
  try {
    // Verify API key
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing API key' }, { status: 401 })
    }
    
    const apiKey = authHeader.substring(7)
    const authResult = await verifyApiKey(apiKey)
    
    if (!authResult.authenticated) {
      console.log('[Memory Ingest] Authentication failed')
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }
    
    // Determine workspace
    const workspace = authResult.teamId 
      ? `team:${authResult.teamId}`
      : `user:${authResult.userId}`
    
    console.log('[Memory Ingest] Authenticated', { workspace })
    
    // Parse and validate request
    const body = await request.json()
    const validationResult = requestSchema.safeParse(body)
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validationResult.error.errors },
        { status: 400 }
      )
    }
    
    const { sessionId, projectPath, chunks } = validationResult.data
    
    console.log('[Memory Ingest] Processing request', {
      workspace,
      sessionId,
      projectPath,
      chunkCount: chunks.length,
    })
    
    // Insert chunks into queue
    const supabase = await createServiceClient()
    const queueItems = chunks.map(chunk => ({
      workspace_id: workspace,
      session_id: sessionId,
      chunk_id: chunk.chunkId,
      content: chunk.content,
      metadata: {
        ...chunk.metadata,
        projectPath,
        ingested_at: new Date().toISOString(),
      },
    }))
    
    // Insert in batches to avoid payload size limits
    const batchSize = 100
    const results = []
    
    for (let i = 0; i < queueItems.length; i += batchSize) {
      const batch = queueItems.slice(i, i + batchSize)
      
      const { data, error } = await supabase
        .from('memory_queue')
        .upsert(batch, {
          onConflict: 'workspace_id,chunk_id',
          ignoreDuplicates: false,
        })
        .select('id, chunk_id, status')
      
      if (error) {
        console.error('[Memory Ingest] Batch insert error', { 
          error,
          batchIndex: i / batchSize,
        })
        // Continue with other batches even if one fails
        results.push({ 
          success: false, 
          error: error.message,
          chunks: batch.map(b => b.chunk_id),
        })
      } else {
        results.push({ 
          success: true, 
          chunks: data?.map(d => ({ 
            chunkId: d.chunk_id, 
            queueId: d.id,
            status: d.status,
          })) || [],
        })
      }
    }
    
    // Calculate summary
    const totalQueued = results
      .filter(r => r.success)
      .reduce((sum, r) => sum + (r.chunks?.length || 0), 0)
    
    const failed = results
      .filter(r => !r.success)
      .reduce((sum, r) => sum + (r.chunks?.length || 0), 0)
    
    console.log('[Memory Ingest] Ingestion completed', {
      workspace,
      totalQueued,
      failed,
    })
    
    // TODO: Trigger processing job (will be implemented with Edge Functions)
    
    return NextResponse.json({
      success: true,
      queued: totalQueued,
      failed,
      results,
      message: 'Chunks queued for processing',
    })
    
  } catch (error) {
    console.error('[Memory Ingest] Unexpected error', { error })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}