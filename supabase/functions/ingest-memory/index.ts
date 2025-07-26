import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createHash } from 'https://deno.land/std@0.160.0/hash/mod.ts'

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
    const workspaceId = `user:${user.id}`
    
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

    let queuedCount = 0
    let skippedCount = 0
    let errorCount = 0

    // Process chunks
    for (const chunk of body.chunks) {
      try {
        // Calculate content hash for deduplication
        const contentHash = await createHash('sha256').update(chunk.content).digest('hex')
        
        // Check if already processed
        const { data: existing } = await serviceClient
          .from('processed_memories')
          .select('id')
          .eq('workspace_id', workspaceId)
          .eq('project_name', body.projectName)
          .eq('content_hash', contentHash)
          .single()
          
        if (existing) {
          console.log(`[Ingest Memory] Skipping duplicate chunk: ${chunk.chunkId}`)
          skippedCount++
          continue
        }

        // Prepare metadata with all relevant information
        const queueMetadata = {
          ...chunk.metadata,
          projectName: body.projectName,
          teamId: body.teamId,
          contentHash
        }

        // Add to memory queue
        const { error } = await serviceClient
          .from('memory_queue')
          .upsert({
            workspace_id: workspaceId,
            session_id: chunk.sessionId,
            chunk_id: chunk.chunkId,
            content: chunk.content,
            content_hash: contentHash,
            metadata: queueMetadata,
            status: 'pending',
            created_at: new Date().toISOString()
          }, {
            onConflict: 'workspace_id,chunk_id',
            ignoreDuplicates: false
          })

        if (error) {
          console.error(`[Ingest Memory] Failed to queue chunk ${chunk.chunkId}:`, error)
          errorCount++
        } else {
          queuedCount++
        }
      } catch (error) {
        console.error(`[Ingest Memory] Error processing chunk ${chunk.chunkId}:`, error)
        errorCount++
      }
    }

    console.log(`[Ingest Memory] Queued ${queuedCount}, skipped ${skippedCount}, errors ${errorCount}`)

    // Return response
    return new Response(
      JSON.stringify({
        success: true,
        queued: queuedCount,
        skipped: skippedCount,
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