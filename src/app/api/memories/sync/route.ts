import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { createHash } from 'crypto'

// Enhanced schema with rich metadata support
const MemorySyncSchema = z.object({
  teamId: z.string().uuid(),
  projectName: z.string(),
  conversationId: z.string().uuid().optional(),
  sessionId: z.string(),
  userId: z.string().uuid().optional(),
  branchName: z.string().optional(),
  commitSha: z.string().optional(),
  chunks: z.array(z.object({
    chunkId: z.string(),
    content: z.string(),
    embedding: z.array(z.number()).length(1536),
    messageType: z.enum(['user', 'assistant', 'system', 'tool_use', 'tool_result']).optional(),
    metadata: z.object({
      filePaths: z.array(z.string()).optional(),
      topics: z.array(z.string()).optional(),
      entitiesMentioned: z.array(z.string()).optional(),
      toolsUsed: z.array(z.string()).optional(),
      hasCode: z.boolean().optional(),
      summary: z.string().optional(),
    }).optional(),
  })),
})

/**
 * Syncs memory chunks from Camille to Supastate with enhanced metadata
 * @param request - Contains team info, conversation context, and memory chunks
 * @returns Success with sync statistics or error with details
 */

export async function POST(request: NextRequest) {
  try {
    // Validate API key
    const apiKey = request.headers.get('x-api-key')
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing API key' }, { status: 401 })
    }

    // Parse and validate request body
    const body = await request.json()
    const { teamId, projectName, chunks } = MemorySyncSchema.parse(body)

    // Initialize Supabase client
    const supabase = await createServiceClient()

    // Verify API key belongs to team
    const { data: apiKeyData, error: apiKeyError } = await supabase
      .from('api_keys')
      .select('team_id')
      .eq('key_hash', apiKey) // In production, this would be a proper hash comparison
      .eq('is_active', true)
      .single()

    if (apiKeyError || apiKeyData?.team_id !== teamId) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }

    // Upsert memory chunks
    const upsertPromises = chunks.map(chunk =>
      supabase.from('memories').upsert({
        team_id: teamId,
        project_name: projectName,
        chunk_id: chunk.chunkId,
        content: chunk.content,
        embedding: chunk.embedding,
        metadata: chunk.metadata || {},
      }, {
        onConflict: 'team_id,chunk_id',
      })
    )

    const results = await Promise.all(upsertPromises)
    
    // Check for errors
    const errors = results.filter(r => r.error).map(r => r.error)
    if (errors.length > 0) {
      return NextResponse.json({ 
        error: 'Failed to sync some chunks', 
        details: errors 
      }, { status: 500 })
    }

    // Update sync status
    await supabase.from('sync_status').insert({
      team_id: teamId,
      project_name: projectName,
      sync_type: 'memory',
      status: 'completed',
      completed_at: new Date().toISOString(),
      stats: {
        chunks_synced: chunks.length,
      },
    })

    return NextResponse.json({ 
      success: true, 
      synced: chunks.length 
    })
  } catch (error) {
    console.error('Memory sync error:', error)
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}