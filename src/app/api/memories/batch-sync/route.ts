import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { createHash } from 'crypto'
import { log } from '@/lib/logger'

// Schema for batch sync - supports larger payloads
const BatchMemorySyncSchema = z.object({
  teamId: z.string().uuid().optional(),
  projectName: z.string(),
  sessionId: z.string().optional(),
  branchName: z.string().optional(),
  commitSha: z.string().optional(),
  chunks: z.array(z.object({
    chunkId: z.string(),
    content: z.string(),
    embedding: z.array(z.number()).length(3072),
    messageType: z.enum(['user', 'assistant', 'system', 'tool_use', 'tool_result']).optional(),
    metadata: z.object({
      filePaths: z.array(z.string()).optional(),
      topics: z.array(z.string()).optional(),
      entitiesMentioned: z.array(z.string()).optional(),
      toolsUsed: z.array(z.string()).optional(),
      hasCode: z.boolean().optional(),
      summary: z.string().optional(),
      conversationId: z.string().uuid().optional(),
      timestamp: z.string().optional(),
    }).optional(),
  })),
  // Batch metadata
  batchMetadata: z.object({
    totalBatches: z.number().optional(),
    currentBatch: z.number().optional(),
    syncSessionId: z.string().optional(),
  }).optional(),
})

/**
 * Batch sync endpoint optimized for large data migrations
 * - Supports larger payloads (up to 100 chunks per request)
 * - Optimized for bulk operations
 * - Returns detailed progress information
 */
export async function POST(request: NextRequest) {
  log.info('Starting batch memory sync request')
  
  try {
    // Check authentication
    const apiKey = request.headers.get('x-api-key')
    const authorization = request.headers.get('authorization')
    
    let authenticatedUserId: string | null = null
    let authenticatedTeamId: string | null = null
    let supabase: any
    
    // Handle API key authentication
    if (apiKey) {
      log.debug('Authenticating with API key')
      
      const serviceClient = await createServiceClient()
      const keyHash = createHash('sha256').update(apiKey).digest('hex')
      
      const { data: apiKeyData, error: apiKeyError } = await serviceClient
        .from('api_keys')
        .select('team_id, user_id')
        .eq('key_hash', keyHash)
        .eq('is_active', true)
        .single()
      
      if (apiKeyError || !apiKeyData) {
        log.error('API key validation error', apiKeyError)
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
    // Handle session authentication
    else if (authorization?.startsWith('Bearer ')) {
      log.debug('Authenticating with session')
      
      supabase = await createClient()
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      
      if (userError || !user) {
        log.error('Session validation error', userError)
        return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
      }
      
      authenticatedUserId = user.id
    } 
    else {
      log.warn('No authentication provided')
      return NextResponse.json({ error: 'Missing authentication' }, { status: 401 })
    }
    
    // Parse and validate request body
    const body = await request.json()
    const { teamId, projectName, chunks, batchMetadata } = BatchMemorySyncSchema.parse(body)
    
    log.info('Processing batch sync request', { 
      teamId, 
      projectName, 
      chunkCount: chunks.length,
      batchInfo: batchMetadata
    })
    
    // Verify team access if teamId is provided
    if (teamId && teamId !== authenticatedTeamId) {
      const { data: memberData } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('user_id', authenticatedUserId)
        .eq('team_id', teamId)
        .single()
      
      if (!memberData) {
        log.warn('User not member of specified team', { userId: authenticatedUserId, teamId })
        return NextResponse.json({ error: 'Access denied to team' }, { status: 403 })
      }
      
      authenticatedTeamId = teamId
    }
    
    log.info('Processing memory chunks', { count: chunks.length })
    
    // Prepare memory data with enhanced metadata
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
        branchName: body.branchName,
        commitSha: body.commitSha,
        syncedAt: new Date().toISOString(),
        batchMetadata,
      },
    }))
    
    // Process in larger batches for better performance
    const batchSize = 100 // Larger batch size for bulk operations
    const results = []
    const startTime = Date.now()
    
    for (let i = 0; i < memoryData.length; i += batchSize) {
      const batch = memoryData.slice(i, i + batchSize)
      const batchNumber = Math.floor(i / batchSize) + 1
      const totalBatches = Math.ceil(memoryData.length / batchSize)
      
      log.debug('Processing batch', { batchNumber, totalBatches })
      
      const { data, error } = await supabase
        .from('memories')
        .upsert(batch, {
          onConflict: 'workspace_id,chunk_id',
          ignoreDuplicates: false,
        })
        .select('id')
      
      if (error) {
        log.error('Batch processing error', error, { batchNumber })
        results.push({ 
          batch: batchNumber, 
          error: error.message,
          processed: 0,
          failed: batch.length
        })
      } else {
        log.debug('Batch processed successfully', { 
          batchNumber, 
          recordsProcessed: data?.length || 0 
        })
        results.push({ 
          batch: batchNumber, 
          success: true, 
          processed: data?.length || batch.length,
          failed: 0
        })
      }
    }
    
    const endTime = Date.now()
    const duration = endTime - startTime
    
    // Calculate statistics
    const totalProcessed = results.reduce((sum, r) => sum + (r.processed || 0), 0)
    const totalFailed = results.reduce((sum, r) => sum + (r.failed || 0), 0)
    const successfulBatches = results.filter(r => r.success).length
    const failedBatches = results.filter(r => r.error).length
    
    log.info('Batch sync completed', {
      durationMs: duration,
      totalProcessed,
      totalFailed,
      successfulBatches,
      failedBatches
    })
    
    // Log sync status
    await supabase.from('sync_logs').insert({
      workspace: authenticatedTeamId ? `team:${authenticatedTeamId}` : `user:${authenticatedUserId}`,
      project_name: projectName,
      sync_type: 'batch_memory',
      status: totalFailed === 0 ? 'completed' : 'partial',
      chunks_synced: totalProcessed,
      chunks_failed: totalFailed,
      duration_ms: duration,
      metadata: {
        batchMetadata,
        results: results.map(r => ({ batch: r.batch, success: r.success, error: r.error }))
      },
      completed_at: new Date().toISOString(),
    })
    
    // Return appropriate response based on results
    if (failedBatches > 0 && successfulBatches === 0) {
      return NextResponse.json({ 
        error: 'All batches failed', 
        details: results,
        statistics: { totalProcessed, totalFailed, duration }
      }, { status: 500 })
    }
    
    return NextResponse.json({ 
      success: true,
      processed: totalProcessed,
      failed: totalFailed,
      duration: duration,
      batches: {
        successful: successfulBatches,
        failed: failedBatches,
        total: results.length
      },
      workspace: authenticatedTeamId ? 'team' : 'personal',
      details: results
    })
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      log.warn('Request validation error', { errors: error.errors })
      return NextResponse.json({ 
        error: 'Invalid request data',
        details: error.errors
      }, { status: 400 })
    }
    
    log.error('Unexpected error in batch sync', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// Support for progress checking
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const syncSessionId = searchParams.get('syncSessionId')
  
  if (!syncSessionId) {
    return NextResponse.json({ error: 'Missing syncSessionId' }, { status: 400 })
  }
  
  // Check authentication
  const apiKey = request.headers.get('x-api-key')
  const authorization = request.headers.get('authorization')
  
  if (!apiKey && !authorization) {
    return NextResponse.json({ error: 'Missing authentication' }, { status: 401 })
  }
  
  try {
    const supabase = await createClient()
    
    // Get sync progress for the session
    const { data, error } = await supabase
      .from('sync_logs')
      .select('*')
      .eq('metadata->>syncSessionId', syncSessionId)
      .order('created_at', { ascending: false })
    
    if (error) {
      log.error('Progress check error', error)
      return NextResponse.json({ error: 'Failed to get progress' }, { status: 500 })
    }
    
    return NextResponse.json({
      syncSessionId,
      logs: data || []
    })
  } catch (error) {
    console.error('[Batch Memory Sync] Progress check error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}