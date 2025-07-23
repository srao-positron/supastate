/**
 * Edge Function to process memory and code embeddings in parallel
 * Uses background tasks to avoid timeout limitations
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import OpenAI from 'https://deno.land/x/openai@v4.20.1/mod.ts'
import { EdgeLogger } from '../_shared/logger.ts'
import { getConfig } from '../_shared/config.ts'

const BATCH_SIZE = parseInt(Deno.env.get('BATCH_SIZE') || '100') // Can process more with background tasks
const PARALLEL_WORKERS = parseInt(Deno.env.get('PARALLEL_WORKERS') || '10')
const RATE_LIMIT_DELAY = parseInt(Deno.env.get('RATE_LIMIT_DELAY') || '1000') // ms

// OpenAI rate limits for embeddings (ada-002)
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

// Background processing function
async function processEmbeddings(requestId: string) {
  const logger = new EdgeLogger('process-embeddings', requestId)
  
  try {
    const config = getConfig()
    
    const supabase = createClient(
      config.supabaseUrl,
      config.supabaseServiceRoleKey
    )
    
    const openai = new OpenAI({
      apiKey: config.openaiApiKey ?? '',
    })
    
    logger.info('Starting background processing', { 
      batchSize: BATCH_SIZE,
      parallelWorkers: PARALLEL_WORKERS 
    })
  
  try {
    // Process memory chunks
    const { data: memoryChunks, error: memoryError } = await supabase
      .from('memory_queue')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE)
    
    if (memoryError) {
      logger.error('Failed to get memory chunks', memoryError)
      throw new Error(`Failed to get memory chunks: ${memoryError.message}`)
    }
    
    if (memoryChunks && memoryChunks.length > 0) {
      logger.info('Processing memory chunks', { count: memoryChunks.length })
      
      // Mark chunks as processing
      const chunkIds = memoryChunks.map(c => c.id)
      await supabase
        .from('memory_queue')
        .update({ status: 'processing' })
        .in('id', chunkIds)
      
      // Process in parallel with rate limiting
      const results = await processInParallel(memoryChunks, async (chunk) => {
        try {
          await waitForRateLimit(chunk.content.length)
          
          const embedding = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: chunk.content,
            dimensions: 1536,
          })
          
          updateStats(chunk.content.length)
          
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
              onConflict: 'chunk_id',
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
          logger.error('Error processing chunk', error, { chunkId: chunk.id })
          
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
      
      const successCount = results.filter(r => r.success).length
      logger.info('Memory processing completed', {
        successful: successCount,
        total: results.length,
        failed: results.length - successCount
      })
    }
    
    // Process code files
    const { data: codeFiles, error: codeError } = await supabase
      .from('code_queue')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(Math.floor(BATCH_SIZE / 2)) // Code files are larger
    
    if (codeError) {
      logger.error('Failed to get code files', codeError)
      throw new Error(`Failed to get code files: ${codeError.message}`)
    }
    
    if (codeFiles && codeFiles.length > 0) {
      logger.info('Processing code files', { count: codeFiles.length })
      
      // Similar processing for code files...
      // (Implementation would be similar to memory chunks)
    }
    
  } catch (error) {
    logger.error('Background processing error', error)
  }
}

// Helper function to process items in parallel with concurrency limit
async function processInParallel<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = []
  const executing: Promise<void>[] = []
  
  for (const item of items) {
    const promise = processor(item).then(result => {
      results.push(result)
    })
    
    executing.push(promise)
    
    if (executing.length >= PARALLEL_WORKERS) {
      await Promise.race(executing)
      executing.splice(executing.findIndex(p => p), 1)
    }
  }
  
  await Promise.all(executing)
  return results
}

// Rate limiting helpers
async function waitForRateLimit(contentLength: number) {
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
  
  // Estimate tokens (rough estimate: 1 token ≈ 4 characters)
  const estimatedTokens = Math.ceil(contentLength / 4)
  
  // Wait if we're at rate limits
  if (stats.requestsThisSecond >= MAX_REQUESTS_PER_SECOND) {
    const waitTime = 1000 - (now - stats.lastSecondReset)
    if (waitTime > 0) {
      await new Promise(resolve => setTimeout(resolve, waitTime))
    }
  }
  
  if (stats.tokensThisMinute + estimatedTokens > MAX_TOKENS_PER_MINUTE) {
    const waitTime = 60000 - (now - stats.lastMinuteReset)
    if (waitTime > 0) {
      // Only log when actually waiting
      await new Promise(resolve => setTimeout(resolve, waitTime))
    }
  }
}

function updateStats(contentLength: number) {
  stats.requestsThisSecond++
  stats.tokensThisMinute += Math.ceil(contentLength / 4)
}

serve(async (req) => {
  const requestId = crypto.randomUUID()
  const logger = new EdgeLogger('process-embeddings', requestId)
  
  try {
    logger.info('Received processing request', {
      method: req.method,
      url: req.url,
    })
    
    // Start background processing
    processEmbeddings(requestId) // Don't await - let it run in background
    
    // Return immediately
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Processing started in background',
        requestId,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { 'Content-Type': 'application/json' },
        status: 200
      }
    )
  } catch (error) {
    logger.error('Request handler error', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        requestId,
        message: config.environment === 'development' ? error.message : undefined
      }),
      { 
        headers: { 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})