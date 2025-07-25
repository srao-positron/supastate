import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { createHash } from 'crypto'
import Logger from '@/lib/logging/logger'
import { getRequestId, sanitizeForLogging } from '@/lib/logging/request-id'
import { ingestionService } from '@/lib/neo4j/ingestion'

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
    
    authLogger.info('Starting Neo4j ingestion', { totalChunks: chunks.length })
    let neo4jSuccessCount = 0
    let neo4jErrors = 0
    
    try {
      // Process chunks in parallel for Neo4j (with concurrency limit)
      const neo4jPromises = chunks.map((chunk, index) => 
        ingestionService.ingestMemory({
          id: `${authenticatedTeamId || authenticatedUserId}-${chunk.chunkId}`,
          content: chunk.content,
          project_name: projectName,
          user_id: authenticatedUserId || undefined,
          team_id: authenticatedTeamId || undefined,
          type: chunk.messageType === 'user' ? 'question' : chunk.messageType === 'assistant' ? 'answer' : 'general',
          metadata: {
            ...chunk.metadata,
            messageType: chunk.messageType,
            sessionId: body.sessionId,
            conversationId: body.conversationId,
            branchName: body.branchName,
            commitSha: body.commitSha,
          },
          chunk_id: chunk.chunkId,
          session_id: body.sessionId,
          file_paths: chunk.metadata?.filePaths,
          topics: chunk.metadata?.topics,
          entities_mentioned: chunk.metadata?.entitiesMentioned,
          tools_used: chunk.metadata?.toolsUsed,
        }, {
          useInferenceEngine: true, // Enable automatic relationship creation
          inferEvolution: index > 0, // Check evolution for non-first chunks
        }).then(() => {
          neo4jSuccessCount++
          return { success: true }
        }).catch((error) => {
          neo4jErrors++
          authLogger.error('Neo4j ingestion failed for chunk', error, { chunkId: chunk.chunkId })
          return { error }
        })
      )
      
      // Process with concurrency limit
      const concurrencyLimit = 5
      for (let i = 0; i < neo4jPromises.length; i += concurrencyLimit) {
        await Promise.all(neo4jPromises.slice(i, i + concurrencyLimit))
      }
      
      authLogger.info('Neo4j ingestion completed', { 
        success: neo4jSuccessCount, 
        failed: neo4jErrors 
      })
    } catch (neo4jError) {
      authLogger.error('Neo4j ingestion batch failed', neo4jError)
      // Log error but continue - we'll return partial success
    }
    
    const syncStatus = {
      workspace: authenticatedTeamId ? `team:${authenticatedTeamId}` : `user:${authenticatedUserId}`,
      project_name: projectName,
      sync_type: 'memory',
      status: neo4jErrors > 0 ? 'partial' : 'completed',
      chunks_synced: neo4jSuccessCount,
      chunks_failed: neo4jErrors,
      duration_ms: Date.now() - new Date().getTime(),
    }
    
    authLogger.info('Sync completed', syncStatus)
    
    if (neo4jErrors > 0 && neo4jSuccessCount === 0) {
      return NextResponse.json({ 
        error: 'Failed to sync all chunks', 
        requestId,
        details: process.env.NODE_ENV === 'development' ? 'Neo4j ingestion failed' : undefined 
      }, { status: 500 })
    }
    
    return NextResponse.json({ 
      success: true, 
      synced: neo4jSuccessCount,
      failed: neo4jErrors,
      workspace: authenticatedTeamId ? 'team' : 'personal'
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