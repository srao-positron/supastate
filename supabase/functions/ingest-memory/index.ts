import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface MemoryChunk {
  sessionId: string
  chunkId: string
  content: string
  metadata?: any
}

interface MemoryIngestionRequest {
  teamId?: string
  projectName: string
  chunks: MemoryChunk[]
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Initialize Supabase client with user's token
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Verify the user is authenticated
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }
    
    // Verify request method
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { 
        status: 405,
        headers: corsHeaders 
      })
    }

    // Parse request body
    const body: MemoryIngestionRequest = await req.json()
    
    if (!body.chunks || !Array.isArray(body.chunks) || body.chunks.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No chunks provided' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Use authenticated user's workspace
    const workspaceId = body.teamId ? `team:${body.teamId}` : `user:${user.id}`
    
    if (!body.projectName) {
      return new Response(
        JSON.stringify({ error: 'projectName is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    console.log(`[Ingest Memory] Processing ${body.chunks.length} chunks for workspace ${workspaceId}`)

    // Create service role client for database operations
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    let savedCount = 0
    let queuedCount = 0
    let errorCount = 0

    // Process chunks
    for (const chunk of body.chunks) {
      try {
        // First save to memories table
        const memoryData = {
          content: chunk.content,
          project_name: body.projectName,
          chunk_id: chunk.chunkId,
          session_id: chunk.sessionId,
          type: 'general',
          user_id: user.id,
          team_id: body.teamId || null,
          metadata: {
            ...chunk.metadata,
            source: 'camille',
            projectName: body.projectName
          }
        }

        // Try to insert, but handle duplicates gracefully
        const { data: memory, error: memoryError } = await serviceClient
          .from('memories')
          .insert(memoryData)
          .select()
          .single()

        if (memoryError) {
          // Check if it's a duplicate error
          if (memoryError.code === '23505' && memoryError.message.includes('memories_workspace_chunk_unique')) {
            console.log(`[Ingest Memory] Memory already exists for chunk ${chunk.chunkId}, skipping...`)
            // Skip this chunk - it's already been processed
            continue
          } else {
            console.error(`[Ingest Memory] Failed to save memory ${chunk.chunkId}:`, memoryError)
            errorCount++
            continue
          }
        }

        if (!memory) {
          errorCount++
          continue
        }

        savedCount++

        // Queue for Neo4j ingestion using pgmq
        const { data: msgId, error: queueError } = await serviceClient.rpc('pgmq_send', {
          queue_name: 'memory_ingestion',
          msg: {
            memory_id: memory.id,
            user_id: user.id,
            workspace_id: workspaceId,
            content: memory.content,
            metadata: memory.metadata || {}
          }
        })

        if (queueError) {
          console.error(`[Ingest Memory] Failed to queue memory ${memory.id}:`, queueError)
          // Don't fail - memory is saved in Supabase
        } else {
          queuedCount++
        }
      } catch (error) {
        console.error(`[Ingest Memory] Error processing chunk ${chunk.chunkId}:`, error)
        errorCount++
      }
    }

    console.log(`[Ingest Memory] Saved ${savedCount}, queued ${queuedCount}, errors ${errorCount}`)

    // Return response
    return new Response(
      JSON.stringify({
        success: true,
        saved: savedCount,
        queued: queuedCount,
        errors: errorCount,
        message: `Processed ${body.chunks.length} chunks`
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error) {
    console.error('[Ingest Memory] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})