/**
 * Edge Function to process memory and code embeddings in parallel
 * Uses background tasks to avoid timeout limitations
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import OpenAI from 'https://deno.land/x/openai@v4.20.1/mod.ts'

const BATCH_SIZE = 100
const PARALLEL_WORKERS = 10

// Background processing function
async function processEmbeddings() {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )
  
  const openai = new OpenAI({
    apiKey: Deno.env.get('OPENAI_API_KEY') ?? '',
  })
  
  console.log('[Process Embeddings] Starting background processing')
  
  try {
    // Process memory chunks
    const { data: memoryChunks, error: memoryError } = await supabase
      .from('memory_queue')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE)
    
    if (memoryError) {
      throw new Error(`Failed to get memory chunks: ${memoryError.message}`)
    }
    
    if (memoryChunks && memoryChunks.length > 0) {
      console.log(`[Process Embeddings] Processing ${memoryChunks.length} memory chunks`)
      
      // Mark chunks as processing
      const chunkIds = memoryChunks.map(c => c.id)
      await supabase
        .from('memory_queue')
        .update({ status: 'processing' })
        .in('id', chunkIds)
      
      // Process chunks
      const promises = memoryChunks.map(async (chunk) => {
        try {
          // Truncate content if it's too large (roughly 4 chars per token)
          let content = chunk.content
          const maxChars = 8192 * 4 // ~32k characters for 8k tokens
          if (content.length > maxChars) {
            console.log(`[Process Embeddings] Truncating chunk ${chunk.id} from ${content.length} to ${maxChars} chars`)
            content = content.substring(0, maxChars)
          }
          
          const embedding = await openai.embeddings.create({
            model: 'text-embedding-3-large',
            input: content,
            dimensions: 3072,
          })
          
          // Insert into memories table
          const { error: insertError } = await supabase
            .from('memories')
            .upsert({
              chunk_id: chunk.chunk_id,
              session_id: chunk.session_id,
              content: chunk.content,
              embedding: embedding.data[0].embedding,
              metadata: chunk.metadata,
              project_name: chunk.metadata?.projectPath ? 
                chunk.metadata.projectPath.split('/').pop() : 'default',
              user_id: chunk.workspace_id.startsWith('user:') ? 
                chunk.workspace_id.substring(5) : null,
              team_id: chunk.workspace_id.startsWith('team:') ? 
                chunk.workspace_id.substring(5) : null,
            }, {
              onConflict: 'workspace_id,chunk_id',
              ignoreDuplicates: false,
            })
          
          if (insertError) {
            throw insertError
          }
          
          // Mark as completed
          await supabase
            .from('memory_queue')
            .update({ 
              status: 'completed',
              processed_at: new Date().toISOString()
            })
            .eq('id', chunk.id)
          
          return { success: true, id: chunk.id }
        } catch (error) {
          console.error(`[Process Embeddings] Error processing chunk ${chunk.id}:`, error)
          
          // Mark as failed
          await supabase
            .from('memory_queue')
            .update({ 
              status: 'failed',
              error: error.message,
              retry_count: chunk.retry_count + 1
            })
            .eq('id', chunk.id)
          
          return { success: false, id: chunk.id, error: error.message }
        }
      })
      
      const results = await Promise.all(promises)
      const successCount = results.filter(r => r.success).length
      console.log(`[Process Embeddings] Completed ${successCount}/${results.length} memory chunks`)
    }
    
  } catch (error) {
    console.error('[Process Embeddings] Background processing error:', error)
  }
}

serve(async (req) => {
  try {
    // Start background processing
    processEmbeddings() // Don't await - let it run in background
    
    // Return immediately
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Processing started in background',
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { 'Content-Type': 'application/json' },
        status: 200
      }
    )
  } catch (error) {
    console.error('[Process Embeddings] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})