import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface CodeFile {
  path: string
  content: string
  language: string
  lastModified: string
  gitMetadata?: {
    repoUrl?: string
    repoName?: string
    branch?: string
    commitSha?: string
    author?: string
    authorEmail?: string
  }
}

interface CodeIngestionRequest {
  files: CodeFile[]
  projectName: string
  fullSync?: boolean
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    const body: CodeIngestionRequest = await req.json()
    
    if (!body.files || !Array.isArray(body.files) || body.files.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No files provided' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    if (!body.projectName) {
      return new Response(
        JSON.stringify({ error: 'projectName is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Use authenticated user's workspace
    const workspaceId = `user:${user.id}`

    console.log(`[Ingest Code] User ${user.id} queuing ${body.files.length} files for project ${body.projectName}`)

    // Create service role client for queueing
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Queue all files for deduplication and processing
    let queuedCount = 0
    const errors: string[] = []

    // Batch queue operations for better performance
    const BATCH_SIZE = 50
    for (let i = 0; i < body.files.length; i += BATCH_SIZE) {
      const batch = body.files.slice(i, Math.min(i + BATCH_SIZE, body.files.length))
      
      // Queue each file in the batch
      const batchPromises = batch.map(async (file) => {
        try {
          const { error: queueError } = await supabase.rpc('pgmq_send', {
            queue_name: 'code_dedupe',
            msg: {
              user_id: user.id,
              workspace_id: workspaceId,
              project_name: body.projectName,
              file_path: file.path,
              language: file.language,
              content: file.content,
              last_modified: file.lastModified,
              git_metadata: file.gitMetadata || null,
              full_sync: body.fullSync || false
            }
          })

          if (queueError) {
            console.error(`[Ingest Code] Failed to queue ${file.path}:`, queueError)
            errors.push(`${file.path}: ${queueError.message}`)
            return false
          }

          return true
        } catch (err) {
          console.error(`[Ingest Code] Exception queuing ${file.path}:`, err)
          errors.push(`${file.path}: ${err.message}`)
          return false
        }
      })

      const results = await Promise.all(batchPromises)
      queuedCount += results.filter(r => r).length
    }

    console.log(`[Ingest Code] Queued ${queuedCount} of ${body.files.length} files`)

    // Return response
    return new Response(
      JSON.stringify({
        success: queuedCount > 0,
        filesQueued: queuedCount,
        filesFailed: body.files.length - queuedCount,
        errors: errors.length > 0 ? errors.slice(0, 10) : undefined, // Limit errors in response
        message: `Queued ${queuedCount} of ${body.files.length} files for processing`
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error) {
    console.error('[Ingest Code] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})