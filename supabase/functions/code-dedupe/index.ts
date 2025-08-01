import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createHash } from 'https://deno.land/std@0.160.0/hash/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// This function processes messages from the code_dedupe queue
serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // This should be called by the queue processor with service role
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

    // Process messages from the queue
    const { data: messages, error: readError } = await supabase.rpc('pgmq_read', {
      queue_name: 'code_dedupe',
      vt: 120, // visibility timeout in seconds
      qty: 10 // process up to 10 messages at a time
    })

    if (readError) {
      console.error('[Code Dedupe] Failed to read from queue:', readError)
      return new Response(
        JSON.stringify({ error: 'Failed to read from queue' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No messages to process' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    console.log(`[Code Dedupe] Processing ${messages.length} messages`)

    const processed: number[] = []
    const failed: number[] = []

    for (const message of messages) {
      try {
        const { 
          user_id, 
          workspace_id, 
          project_name, 
          file_path, 
          language, 
          content, 
          git_metadata,
          full_sync 
        } = message.message

        // Calculate content hash
        const contentHash = await createHash('sha256').update(content).digest('hex')
        
        // Check if file exists and has changed
        const { data: existingFile } = await supabase
          .from('code_entities')
          .select('id, metadata')
          .is('team_id', null)
          .eq('user_id', user_id)
          .eq('project_name', project_name)
          .eq('file_path', file_path)
          .eq('name', file_path.split('/').pop() || file_path)
          .eq('entity_type', 'module')
          .maybeSingle()

        // Skip if content hasn't changed (unless full sync)
        if (!full_sync && existingFile && existingFile.metadata?.contentHash === contentHash) {
          console.log(`[Code Dedupe] Skipping unchanged file: ${file_path}`)
          processed.push(message.msg_id)
          continue
        }

        let entityId: string

        const entityData = {
          file_path,
          name: file_path.split('/').pop() || file_path,
          entity_type: 'module',
          language,
          source_code: content,
          user_id,
          project_name,
          team_id: null,
          metadata: {
            contentHash,
            size: new TextEncoder().encode(content).length,
            lineCount: content.split('\n').length,
            gitMetadata: git_metadata || null,
            workspaceId: workspace_id
          }
        }

        if (existingFile) {
          // Update existing
          const { data: updated, error: updateError } = await supabase
            .from('code_entities')
            .update({
              ...entityData,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingFile.id)
            .select('id')
            .single()

          if (updateError) {
            console.error(`[Code Dedupe] Failed to update ${file_path}:`, updateError)
            failed.push(message.msg_id)
            continue
          }
          
          entityId = updated.id
          console.log(`[Code Dedupe] Updated entity: ${entityId}`)
        } else {
          // Insert new
          entityId = crypto.randomUUID()
          const { error: insertError } = await supabase
            .from('code_entities')
            .insert({
              id: entityId,
              ...entityData
            })

          if (insertError) {
            // Handle duplicate key by fetching existing
            if (insertError.code === '23505') {
              const { data: existing } = await supabase
                .from('code_entities')
                .select('id')
                .is('team_id', null)
                .eq('user_id', user_id)
                .eq('project_name', project_name)
                .eq('file_path', file_path)
                .eq('name', file_path.split('/').pop() || file_path)
                .eq('entity_type', 'module')
                .maybeSingle()
              
              if (existing) {
                entityId = existing.id
                console.log(`[Code Dedupe] Found existing entity on retry: ${entityId}`)
              } else {
                console.error(`[Code Dedupe] Failed to insert ${file_path}:`, insertError)
                failed.push(message.msg_id)
                continue
              }
            } else {
              console.error(`[Code Dedupe] Failed to insert ${file_path}:`, insertError)
              failed.push(message.msg_id)
              continue
            }
          } else {
            console.log(`[Code Dedupe] Inserted new entity: ${entityId}`)
          }
        }

        // Queue for Neo4j ingestion
        const { error: queueError } = await supabase.rpc('pgmq_send', {
          queue_name: 'code_ingestion',
          msg: {
            code_entity_id: entityId,
            user_id,
            workspace_id,
            content,
            metadata: {
              path: file_path,
              language,
              project_name,
              git_metadata: git_metadata || null
            }
          }
        })

        if (queueError) {
          console.error(`[Code Dedupe] Failed to queue for ingestion:`, queueError)
          failed.push(message.msg_id)
          continue
        }

        // Queue GitHub reference detection
        try {
          await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/detect-github-references`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
            },
            body: JSON.stringify({
              code_entity_id: entityId
            })
          })
        } catch (detectError) {
          console.error('[Code Dedupe] Failed to trigger GitHub detection:', detectError)
          // Don't fail the main operation
        }

        processed.push(message.msg_id)
      } catch (error) {
        console.error(`[Code Dedupe] Error processing message ${message.msg_id}:`, error)
        failed.push(message.msg_id)
      }
    }

    // Delete processed messages
    if (processed.length > 0) {
      await supabase.rpc('pgmq_delete', {
        queue_name: 'code_dedupe',
        msg_ids: processed
      })
    }

    console.log(`[Code Dedupe] Processed: ${processed.length}, Failed: ${failed.length}`)

    return new Response(
      JSON.stringify({
        processed: processed.length,
        failed: failed.length,
        total: messages.length
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error) {
    console.error('[Code Dedupe] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})