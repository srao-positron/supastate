import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { createHash } from 'crypto'

// Enhanced schema with rich metadata support
const MemorySyncSchema = z.object({
  teamId: z.string().uuid().optional(), // Optional for personal workspaces
  projectName: z.string(),
  conversationId: z.string().uuid().optional(),
  sessionId: z.string(),
  userId: z.string().uuid().optional(),
  branchName: z.string().optional(),
  commitSha: z.string().optional(),
  chunks: z.array(z.object({
    chunkId: z.string(),
    content: z.string(),
    embedding: z.array(z.number()).length(3072), // text-embedding-3-large dimensions
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
 * Supports both API key and session-based authentication
 */
export async function POST(request: NextRequest) {
  console.log('[Memory Sync] Starting sync request')
  
  try {
    // Check authentication method
    const apiKey = request.headers.get('x-api-key')
    const authorization = request.headers.get('authorization')
    
    let authenticatedUserId: string | null = null
    let authenticatedTeamId: string | null = null
    let supabase: any
    
    // Handle API key authentication
    if (apiKey) {
      console.log('[Memory Sync] Authenticating with API key')
      
      // Use service client to verify API key
      const serviceClient = await createServiceClient()
      
      // Hash the API key for comparison
      const keyHash = createHash('sha256').update(apiKey).digest('hex')
      console.log('[Memory Sync] API key hash:', keyHash)
      console.log('[Memory Sync] Using Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
      
      const { data: apiKeyData, error: apiKeyError } = await serviceClient
        .from('api_keys')
        .select('team_id, user_id')
        .eq('key_hash', keyHash)
        .eq('is_active', true)
        .single()
      
      if (apiKeyError || !apiKeyData) {
        console.error('[Memory Sync] API key validation error:', apiKeyError)
        return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
      }
      
      // Update last used timestamp
      await serviceClient
        .from('api_keys')
        .update({ last_used_at: new Date().toISOString() })
        .eq('key_hash', keyHash)
      
      authenticatedUserId = apiKeyData.user_id
      authenticatedTeamId = apiKeyData.team_id
      
      // Set user context for RLS
      await serviceClient.rpc('set_api_user_context', { 
        p_user_id: authenticatedUserId || authenticatedTeamId 
      })
      
      supabase = serviceClient
    } 
    // Handle session authentication (from web dashboard)
    else if (authorization?.startsWith('Bearer ')) {
      console.log('[Memory Sync] Authenticating with session')
      
      // Use regular client for session auth
      supabase = await createClient()
      
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      
      if (userError || !user) {
        console.error('[Memory Sync] Session validation error:', userError)
        return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
      }
      
      authenticatedUserId = user.id
    } 
    else {
      console.error('[Memory Sync] No authentication provided')
      return NextResponse.json({ error: 'Missing authentication' }, { status: 401 })
    }
    
    // Parse and validate request body
    const body = await request.json()
    console.log('[Memory Sync] Request body:', { 
      teamId: body.teamId, 
      projectName: body.projectName, 
      chunkCount: body.chunks?.length || 0 
    })
    
    const { teamId, projectName, chunks } = MemorySyncSchema.parse(body)
    
    // Verify team access if teamId is provided
    if (teamId && teamId !== authenticatedTeamId) {
      // Check if user is member of the team
      const { data: memberData } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('user_id', authenticatedUserId)
        .eq('team_id', teamId)
        .single()
      
      if (!memberData) {
        console.error('[Memory Sync] User not member of specified team')
        return NextResponse.json({ error: 'Access denied to team' }, { status: 403 })
      }
      
      authenticatedTeamId = teamId
    }
    
    console.log(`[Memory Sync] Upserting ${chunks.length} chunks`)
    
    // Prepare memory data
    const memoryData = chunks.map(chunk => ({
      team_id: authenticatedTeamId,
      user_id: authenticatedTeamId ? null : authenticatedUserId,
      project_name: projectName,
      chunk_id: chunk.chunkId,
      content: chunk.content,
      embedding: chunk.embedding,
      metadata: {
        ...chunk.metadata,
        messageType: chunk.messageType,
        sessionId: body.sessionId,
        conversationId: body.conversationId,
        branchName: body.branchName,
        commitSha: body.commitSha,
        syncedAt: new Date().toISOString(),
      },
    }))
    
    // Batch upsert for better performance
    const batchSize = 50 // Smaller batches for large embeddings
    const results = []
    
    for (let i = 0; i < memoryData.length; i += batchSize) {
      const batch = memoryData.slice(i, i + batchSize)
      console.log(`[Memory Sync] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(memoryData.length / batchSize)}`)
      
      const { data, error } = await supabase
        .from('memories')
        .upsert(batch, {
          onConflict: 'workspace_id,chunk_id',
          ignoreDuplicates: false,
        })
        .select('id')
      
      if (error) {
        console.error('[Memory Sync] Batch upsert error:', error)
        results.push({ error })
      } else {
        console.log(`[Memory Sync] Successfully upserted ${data?.length || 0} records`)
        results.push({ success: true, count: data?.length || batch.length })
      }
    }
    
    // Check for errors
    const errors = results.filter(r => r.error).map(r => r.error)
    const successCount = results.filter(r => r.success).reduce((sum, r) => sum + r.count, 0)
    
    console.log(`[Memory Sync] Sync completed. Success: ${successCount}, Errors: ${errors.length}`)
    
    if (errors.length > 0 && successCount === 0) {
      return NextResponse.json({ 
        error: 'Failed to sync all chunks', 
        details: errors 
      }, { status: 500 })
    }
    
    // Log sync status
    console.log('[Memory Sync] Sync status:', {
      workspace: authenticatedTeamId ? `team:${authenticatedTeamId}` : `user:${authenticatedUserId}`,
      project_name: projectName,
      sync_type: 'memory',
      status: errors.length > 0 ? 'partial' : 'completed',
      chunks_synced: successCount,
      chunks_failed: errors.length,
      completed_at: new Date().toISOString(),
    })
    
    return NextResponse.json({ 
      success: true, 
      synced: successCount,
      failed: errors.length,
      workspace: authenticatedTeamId ? 'team' : 'personal'
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('[Memory Sync] Validation error:', error.errors)
      return NextResponse.json({ 
        error: 'Invalid request data',
        details: error.errors
      }, { status: 400 })
    }
    
    console.error('[Memory Sync] Unexpected error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}