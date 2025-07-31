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

function getEntityType(language: string): string {
  // Always return 'module' to match existing data in the database
  // The unique constraint includes entity_type, so we need consistency
  return 'module'
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
    let queuedCount = 0
    
    for (const file of body.files) {
      // Log the incoming file data
      console.log(`[Ingest Code] Received file: path="${file.path}", language="${file.language}"`)
      
      // Calculate content hash
      const contentHash = await createHash('sha256').update(file.content).digest('hex')
      
      // Check if file has changed in code_entities table - match ALL constraint fields
      console.log(`[Ingest Code] Checking for existing file: project=${body.projectName}, path=${file.path}, name=${file.path.split('/').pop()}, entity_type=${getEntityType(file.language)}`)
      
      const { data: existingFile, error: checkError } = await supabase
        .from('code_entities')
        .select('id, metadata')
        .is('team_id', null)  // Use .is() for null comparison
        .eq('user_id', user.id)
        .eq('project_name', body.projectName)
        .eq('file_path', file.path)
        .eq('name', file.path.split('/').pop() || file.path)
        .eq('entity_type', getEntityType(file.language))
        .maybeSingle()  // Use maybeSingle instead of single
        
      if (checkError) {
        console.error(`[Ingest Code] Error checking for existing file:`, checkError)
      }
      
      if (!existingFile) {
        console.log(`[Ingest Code] No existing file found for: ${file.path}`)
      } else {
        console.log(`[Ingest Code] Found existing file with ID: ${existingFile.id}`)
      }

      // Skip if content hasn't changed (unless full sync requested)
      if (!body.fullSync && existingFile && existingFile.metadata?.contentHash === contentHash) {
        console.log(`[Ingest Code] Skipping unchanged file: ${file.path}`)
        continue
      }

      // Replace upsert with explicit SELECT/INSERT/UPDATE logic
      console.log(`[Ingest Code] Processing file: ${file.path}`)
      
      let finalEntityId: string
      
      if (existingFile) {
        console.log(`[Ingest Code] Found existing file with ID: ${existingFile.id}`)
        
        // UPDATE existing entity
        const { data: updatedEntity, error: updateError } = await supabase
          .from('code_entities')
          .update({
            language: file.language,
            source_code: file.content,
            metadata: {
              contentHash,
              size: new TextEncoder().encode(file.content).length,
              lineCount: file.content.split('\n').length,
              gitMetadata: file.gitMetadata || null,
              workspaceId: workspaceId // Store workspace ID in metadata
            },
            updated_at: new Date().toISOString()
          })
          .eq('id', existingFile.id)
          .select('id')
          .single()
          
        if (updateError) {
          console.error(`[Ingest Code] Failed to update entity ${existingFile.id}:`, updateError)
          continue
        }
        
        if (updatedEntity && updatedEntity.id) {
          finalEntityId = updatedEntity.id
          console.log(`[Ingest Code] Successfully updated entity: ${finalEntityId} (returned from DB)`)
        } else {
          console.error(`[Ingest Code] Update succeeded but no data returned! Using existing ID: ${existingFile.id}`)
          finalEntityId = existingFile.id
        }
        
      } else {
        // INSERT new entity
        const newEntityId = crypto.randomUUID()
        console.log(`[Ingest Code] Creating new entity with ID: ${newEntityId}`)
        
        const insertPayload = {
          id: newEntityId,
          team_id: null,
          file_path: file.path,
          name: file.path.split('/').pop() || file.path,
          entity_type: getEntityType(file.language),
          language: file.language,
          source_code: file.content,
          user_id: user.id,
          project_name: body.projectName,
          metadata: {
            contentHash,
            size: new TextEncoder().encode(file.content).length,
            lineCount: file.content.split('\n').length,
            gitMetadata: file.gitMetadata || null,
            workspaceId: workspaceId // Store workspace ID in metadata
          }
        }
        
        console.log(`[Ingest Code] Inserting with payload:`, JSON.stringify({
          id: insertPayload.id,
          team_id: insertPayload.team_id,
          file_path: insertPayload.file_path,
          name: insertPayload.name,
          entity_type: insertPayload.entity_type,
          user_id: insertPayload.user_id,
          project_name: insertPayload.project_name
        }))
        
        const { data: insertedEntity, error: insertError } = await supabase
          .from('code_entities')
          .insert(insertPayload)
          .select('id')
          .single()
          
        if (insertError) {
          console.error(`[Ingest Code] Failed to insert entity:`, insertError)
          console.error(`[Ingest Code] Insert attempted with: team_id=null, user_id=${user.id}, project=${body.projectName}, path=${file.path}, name=${file.path.split('/').pop()}, entity_type=${getEntityType(file.language)}`)
          
          // If insert failed due to duplicate key, try to fetch the existing entity
          if (insertError.code === '23505') {
            console.log(`[Ingest Code] Insert failed due to duplicate key, fetching existing entity...`)
            const { data: fetchedEntity } = await supabase
              .from('code_entities')
              .select('id')
              .is('team_id', null)  // Use .is() for null comparison
              .eq('user_id', user.id)
              .eq('project_name', body.projectName)
              .eq('file_path', file.path)
              .eq('name', file.path.split('/').pop() || file.path)
              .eq('entity_type', getEntityType(file.language))
              .maybeSingle()
              
            if (fetchedEntity) {
              console.log(`[Ingest Code] Found existing entity on retry: ${fetchedEntity.id}`)
              finalEntityId = fetchedEntity.id
              // Continue with this ID instead of skipping
            } else {
              console.error(`[Ingest Code] Could not find entity even after duplicate key error!`)
              continue
            }
          } else {
            continue
          }
        } else if (insertedEntity && insertedEntity.id) {
          finalEntityId = insertedEntity.id
          console.log(`[Ingest Code] Successfully inserted entity: ${finalEntityId} (returned from DB)`)
        } else {
          console.error(`[Ingest Code] Insert succeeded but no data returned! Using generated ID: ${newEntityId}`)
          finalEntityId = newEntityId
        }
      }
      
      // Double-check the entity exists before queueing
      console.log(`[Ingest Code] Verifying entity exists: ${finalEntityId}`)
      const { data: verifyEntity, error: verifyError } = await supabase
        .from('code_entities')
        .select('id')
        .eq('id', finalEntityId)
        .single()
        
      if (verifyError || !verifyEntity) {
        console.error(`[Ingest Code] CRITICAL: Entity ${finalEntityId} not found after insert/update!`)
        continue
      }
      
      console.log(`[Ingest Code] Verified entity exists: ${finalEntityId}`)
      
      // Add to pgmq queue
      console.log(`[Ingest Code] Queueing entity ${finalEntityId} for Neo4j ingestion`)
      const { error: queueError } = await supabase.rpc('pgmq_send', {
        queue_name: 'code_ingestion',
        msg: {
          code_entity_id: finalEntityId,
          user_id: user.id,
          workspace_id: workspaceId,
          content: file.content,
          metadata: {
            path: file.path,
            language: file.language,
            project_name: body.projectName,
            git_metadata: file.gitMetadata || null
          }
        }
      })

      if (queueError) {
        console.error('[Ingest Code] Failed to queue file:', queueError)
        continue
      }

      queuedCount++
    }

    // Update task with actual file count
    await supabase
      .from('code_processing_tasks')
      .update({ 
        total_files: queuedCount,
        status: queuedCount > 0 ? 'queued' : 'completed',
        started_at: new Date().toISOString()
      })
      .eq('id', taskId)

    // Return response
    return new Response(
      JSON.stringify({
        success: true,
        taskId,
        filesQueued: queuedCount,
        filesSkipped: body.files.length - queuedCount,
        message: queuedCount > 0 
          ? `Queued ${queuedCount} files for processing`
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