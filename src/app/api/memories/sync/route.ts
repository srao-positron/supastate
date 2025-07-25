import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { createHash } from 'crypto'
import Logger from '@/lib/logging/logger'
import { getRequestId, sanitizeForLogging } from '@/lib/logging/request-id'

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
  const requestId = getRequestId(request)
  const logger = new Logger({ 
    operation: 'memory_sync',
    requestId,
  })
  
  logger.info('Starting sync request')
  
  try {
    // Check authentication method
    const apiKey = request.headers.get('x-api-key')
    const authorization = request.headers.get('authorization')
    
    let authenticatedUserId: string | null = null
    let authenticatedTeamId: string | null = null
    let supabase: any
    
    // Handle API key authentication
    if (apiKey) {
      logger.debug('Authenticating with API key')
      
      // Use service client to verify API key
      const serviceClient = await createServiceClient()
      
      // Hash the API key for comparison
      const keyHash = createHash('sha256').update(apiKey).digest('hex')
      logger.debug('API key validation', { 
        keyHashPrefix: keyHash.substring(0, 8) + '...',
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL 
      })
      
      const { data: apiKeyData, error: apiKeyError } = await serviceClient
        .from('api_keys')
        .select('team_id, user_id')
        .eq('key_hash', keyHash)
        .eq('is_active', true)
        .single()
      
      if (apiKeyError || !apiKeyData) {
        logger.warn('API key validation failed', { error: apiKeyError })
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
      logger.debug('Authenticating with session')
      
      // Use regular client for session auth
      supabase = await createClient()
      
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      
      if (userError || !user) {
        logger.warn('Session validation failed', { error: userError })
        return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
      }
      
      authenticatedUserId = user.id
    } 
    else {
      logger.warn('No authentication provided')
      return NextResponse.json({ error: 'Missing authentication' }, { status: 401 })
    }
    
    // Parse and validate request body
    const body = await request.json()
    
    // Update logger with authenticated context
    const authLogger = logger.child({
      userId: authenticatedUserId,
      teamId: authenticatedTeamId,
      workspace: authenticatedTeamId ? `team:${authenticatedTeamId}` : `user:${authenticatedUserId}`,
    })
    
    authLogger.info('Processing sync request', { 
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
        .eq('user_id', authenticatedUserId!)
        .eq('team_id', teamId)
        .single()
      
      if (!memberData) {
        authLogger.warn('Access denied - user not member of team', { requestedTeamId: teamId })
        return NextResponse.json({ error: 'Access denied to team' }, { status: 403 })
      }
      
      authenticatedTeamId = teamId
    }
    
    // Prepare workspace_id for the queue entries
    const workspaceId = authenticatedTeamId ? `team:${authenticatedTeamId}` : `user:${authenticatedUserId}`
    
    authLogger.info('Creating memory queue entries', { totalChunks: chunks.length })
    let queueSuccessCount = 0
    let queueErrors = 0
    
    try {
      // Create queue entries for each chunk
      const queuePromises = chunks.map(async (chunk) => {
        try {
          // Prepare metadata with all relevant information including the embedding
          const queueMetadata = {
            ...chunk.metadata,
            messageType: chunk.messageType,
            conversationId: body.conversationId,
            branchName: body.branchName,
            commitSha: body.commitSha,
            projectName,
            embedding: chunk.embedding, // Store the pre-computed embedding in metadata
            userId: authenticatedUserId,
            teamId: authenticatedTeamId,
          }
          
          // Insert into memory_queue
          const { error } = await supabase
            .from('memory_queue')
            .upsert({
              workspace_id: workspaceId,
              session_id: body.sessionId,
              chunk_id: chunk.chunkId,
              content: chunk.content,
              metadata: queueMetadata,
              status: 'pending',
            }, {
              onConflict: 'workspace_id,chunk_id',
              ignoreDuplicates: false, // Update existing entries
            })
          
          if (error) {
            queueErrors++
            authLogger.error('Failed to create queue entry', error, { chunkId: chunk.chunkId })
            return { error }
          }
          
          queueSuccessCount++
          return { success: true }
        } catch (error) {
          queueErrors++
          authLogger.error('Unexpected error creating queue entry', error, { chunkId: chunk.chunkId })
          return { error }
        }
      })
      
      // Process with concurrency limit
      const concurrencyLimit = 10 // Higher limit since we're just inserting to DB
      for (let i = 0; i < queuePromises.length; i += concurrencyLimit) {
        await Promise.all(queuePromises.slice(i, i + concurrencyLimit))
      }
      
      authLogger.info('Queue entries created', { 
        success: queueSuccessCount, 
        failed: queueErrors 
      })
    } catch (queueError) {
      authLogger.error('Queue creation batch failed', queueError)
      // Log error but continue - we'll return partial success
    }
    
    const syncStatus = {
      workspace: workspaceId,
      project_name: projectName,
      sync_type: 'memory',
      status: queueErrors > 0 ? 'partial' : 'completed',
      chunks_queued: queueSuccessCount,
      chunks_failed: queueErrors,
      duration_ms: Date.now() - new Date().getTime(),
    }
    
    authLogger.info('Sync completed', syncStatus)
    
    if (queueErrors > 0 && queueSuccessCount === 0) {
      return NextResponse.json({ 
        error: 'Failed to queue all chunks', 
        requestId,
        details: process.env.NODE_ENV === 'development' ? 'Queue creation failed' : undefined 
      }, { status: 500 })
    }
    
    return NextResponse.json({ 
      success: true, 
      queued: queueSuccessCount,
      failed: queueErrors,
      workspace: authenticatedTeamId ? 'team' : 'personal',
      message: 'Chunks queued for processing'
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn('Request validation failed', { errors: error.errors })
      return NextResponse.json({ 
        error: 'Invalid request data',
        requestId,
        details: error.errors
      }, { status: 400 })
    }
    
    logger.error('Unexpected error during sync', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      requestId,
      message: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : undefined
    }, { status: 500 })
  }
}