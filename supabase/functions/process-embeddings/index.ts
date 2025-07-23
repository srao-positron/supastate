/**
 * Edge Function to process memory and code embeddings in parallel
 * Respects OpenAI rate limits while maximizing throughput
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import OpenAI from 'https://deno.land/x/openai@v4.20.1/mod.ts'

const BATCH_SIZE = parseInt(Deno.env.get('BATCH_SIZE') || '5') // Reduced for 5s timeout
const PARALLEL_WORKERS = parseInt(Deno.env.get('PARALLEL_WORKERS') || '3') // Reduced for 5s timeout
const RATE_LIMIT_DELAY = parseInt(Deno.env.get('RATE_LIMIT_DELAY') || '1000') // ms

// OpenAI rate limits for embeddings (ada-002)
// Tier 1: 3,000 RPM, 1,000,000 TPM
// We'll be conservative: 2,500 RPM = ~41 RPS
const MAX_REQUESTS_PER_SECOND = 40
const MAX_TOKENS_PER_MINUTE = 900000 // Leave buffer

interface ProcessingStats {
  requestsThisSecond: number
  tokensThisMinute: number
  lastSecondReset: number
  lastMinuteReset: number
}

const stats: ProcessingStats = {
  requestsThisSecond: 0,
  tokensThisMinute: 0,
  lastSecondReset: Date.now(),
  lastMinuteReset: Date.now(),
}

// Reset counters
setInterval(() => {
  const now = Date.now()
  if (now - stats.lastSecondReset >= 1000) {
    stats.requestsThisSecond = 0
    stats.lastSecondReset = now
  }
  if (now - stats.lastMinuteReset >= 60000) {
    stats.tokensThisMinute = 0
    stats.lastMinuteReset = now
  }
}, 100)

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    
    const openai = new OpenAI({
      apiKey: Deno.env.get('OPENAI_API_KEY') ?? '',
    })
    
    console.log('[Process Embeddings] Starting processing run')
    
    // Get pending chunks
    const { data: chunks, error } = await supabase
      .rpc('get_pending_memory_chunks', { batch_size: BATCH_SIZE })
    
    if (error) {
      throw new Error(`Failed to get pending chunks: ${error.message}`)
    }
    
    if (!chunks || chunks.length === 0) {
      console.log('[Process Embeddings] No pending chunks')
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }
    
    console.log(`[Process Embeddings] Processing ${chunks.length} chunks`)
    
    // Process chunks in parallel with rate limiting
    const results = await processInParallel(chunks, async (chunk) => {
      try {
        // Wait for rate limit if needed
        await waitForRateLimit(chunk.content.length)
        
        // Generate embedding
        const embedding = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: chunk.content,
          dimensions: 1536, // Optimized size for Postgres
        })
        
        // Update stats
        stats.requestsThisSecond++
        stats.tokensThisMinute += Math.ceil(chunk.content.length / 4) // Approximate tokens
        
        // Insert into memories table
        const { error: insertError } = await supabase
          .from('memories')
          .insert({
            workspace_id: chunk.workspace_id,
            session_id: chunk.session_id,
            chunk_id: chunk.chunk_id,
            content: chunk.content,
            embedding: embedding.data[0].embedding,
            metadata: chunk.metadata,
            queue_id: chunk.id,
            processing_status: 'completed',
          })
          .single()
        
        if (insertError) {
          throw insertError
        }
        
        // Mark as completed in queue
        await supabase
          .from('memory_queue')
          .update({ 
            status: 'completed',
            processed_at: new Date().toISOString(),
          })
          .eq('id', chunk.id)
        
        return { success: true, chunkId: chunk.chunk_id }
        
      } catch (error) {
        console.error(`[Process Embeddings] Error processing chunk ${chunk.chunk_id}:`, error)
        
        // Mark as failed in queue
        await supabase
          .from('memory_queue')
          .update({ 
            status: 'failed',
            error_message: error.message,
            retry_count: chunk.retry_count + 1,
          })
          .eq('id', chunk.id)
        
        return { success: false, chunkId: chunk.chunk_id, error: error.message }
      }
    })
    
    const successful = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length
    
    console.log(`[Process Embeddings] Completed: ${successful} successful, ${failed} failed`)
    
    return new Response(
      JSON.stringify({ 
        processed: chunks.length,
        successful,
        failed,
        results,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    console.error('[Process Embeddings] Fatal error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

// Process items in parallel with concurrency limit
async function processInParallel<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  maxConcurrency: number = PARALLEL_WORKERS
): Promise<R[]> {
  const results: R[] = []
  const executing: Promise<void>[] = []
  
  for (const item of items) {
    const promise = processor(item).then(result => {
      results.push(result)
    })
    
    executing.push(promise)
    
    if (executing.length >= maxConcurrency) {
      await Promise.race(executing)
      executing.splice(executing.findIndex(p => p === promise), 1)
    }
  }
  
  await Promise.all(executing)
  return results
}

// Smart rate limiting
async function waitForRateLimit(contentLength: number) {
  const estimatedTokens = Math.ceil(contentLength / 4)
  
  // Check if we need to wait for rate limits
  while (true) {
    const now = Date.now()
    
    // Reset counters if needed
    if (now - stats.lastSecondReset >= 1000) {
      stats.requestsThisSecond = 0
      stats.lastSecondReset = now
    }
    
    if (now - stats.lastMinuteReset >= 60000) {
      stats.tokensThisMinute = 0
      stats.lastMinuteReset = now
    }
    
    // Check if we can proceed
    if (stats.requestsThisSecond < MAX_REQUESTS_PER_SECOND &&
        stats.tokensThisMinute + estimatedTokens < MAX_TOKENS_PER_MINUTE) {
      break
    }
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}