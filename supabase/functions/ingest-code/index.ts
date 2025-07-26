import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createHash } from 'https://deno.land/std@0.160.0/hash/mod.ts'

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

serve(async (req, connInfo) => {
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

    console.log(`[Ingest Code] User ${user.id} uploading ${body.files.length} files for project ${body.projectName}`)

    // Create service role client for database operations
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

    // Create a processing task
    const taskId = crypto.randomUUID()
    const { error: taskError } = await supabase
      .from('code_processing_tasks')
      .insert({
        id: taskId,
        workspace_id: workspaceId,
        project_name: body.projectName,
        total_files: body.files.length,
        status: 'pending'
      })

    if (taskError) {
      console.error('[Ingest Code] Failed to create processing task:', taskError)
      return new Response(
        JSON.stringify({ error: 'Failed to create processing task' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    // Process files and add to queue
    const queueItems = []
    const fileUpdates = []
    
    for (const file of body.files) {
      // Calculate content hash
      const contentHash = await createHash('sha256').update(file.content).digest('hex')
      
      // Check if file has changed
      const { data: existingFile } = await supabase
        .from('code_files')
        .select('id, content_hash')
        .eq('workspace_id', workspaceId)
        .eq('project_name', body.projectName)
        .eq('path', file.path)
        .single()

      // Skip if content hasn't changed (unless full sync requested)
      if (!body.fullSync && existingFile && existingFile.content_hash === contentHash) {
        console.log(`[Ingest Code] Skipping unchanged file: ${file.path}`)
        continue
      }

      // Add to processing queue
      queueItems.push({
        task_id: taskId,
        file_path: file.path,
        content: file.content,
        language: file.language,
        workspace_id: workspaceId,
        project_name: body.projectName,
        git_metadata: file.gitMetadata || null,
        status: 'pending'
      })

      // Prepare file record update
      fileUpdates.push({
        path: file.path,
        project_name: body.projectName,
        workspace_id: workspaceId,
        language: file.language,
        content: file.content,
        content_hash: contentHash,
        size: new TextEncoder().encode(file.content).length,
        line_count: file.content.split('\n').length,
        git_metadata: file.gitMetadata || null
      })
    }

    // Insert into processing queue
    if (queueItems.length > 0) {
      const { error: queueError } = await supabase
        .from('code_processing_queue')
        .insert(queueItems)

      if (queueError) {
        console.error('[Ingest Code] Failed to queue files:', queueError)
        return new Response(
          JSON.stringify({ error: 'Failed to queue files for processing' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        )
      }

      // Upsert file records
      const { error: fileError } = await supabase
        .from('code_files')
        .upsert(fileUpdates, {
          onConflict: 'workspace_id,project_name,path'
        })

      if (fileError) {
        console.error('[Ingest Code] Failed to update file records:', fileError)
      }
    }

    // Update task with actual file count
    await supabase
      .from('code_processing_tasks')
      .update({ 
        total_files: queueItems.length,
        status: queueItems.length > 0 ? 'pending' : 'completed',
        started_at: new Date().toISOString()
      })
      .eq('id', taskId)

    // Trigger processing if there are files to process
    if (queueItems.length > 0) {
      const runtime = connInfo as any
      if (runtime?.waitUntil) {
        // Trigger the processing edge function
        const processUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/process-code`
        const processResponse = fetch(processUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ taskId })
        })

        runtime.waitUntil(processResponse)
      }
    }

    // Return response
    return new Response(
      JSON.stringify({
        success: true,
        taskId,
        filesQueued: queueItems.length,
        filesSkipped: body.files.length - queueItems.length,
        message: queueItems.length > 0 
          ? `Processing ${queueItems.length} files in background`
          : 'No files needed processing'
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
        headers: { 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})