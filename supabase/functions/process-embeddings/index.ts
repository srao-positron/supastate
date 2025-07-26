/**
 * Edge Function to process memory embeddings and store them in Neo4j
 * Uses Supabase Background Tasks for long-running operations
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import OpenAI from 'https://deno.land/x/openai@v4.20.1/mod.ts'
// Use unpkg CDN version that works with Deno - ESM build
import neo4j from 'https://unpkg.com/neo4j-driver@5.12.0/lib/browser/neo4j-web.esm.js'

const BATCH_SIZE = 500 // Increased from 100
const PARALLEL_WORKERS = 20 // Increased from 10
const MAX_RETRIES = 3

// Extract meaningful memory type from metadata
function getMemoryType(metadata: any): string {
  if (!metadata) return 'general'
  
  const { hasCode, topics, tools, messageType } = metadata
  
  if (messageType && messageType !== 'general') {
    return messageType
  }
  
  if (hasCode) {
    if (topics?.includes('debugging') || topics?.includes('error') || topics?.includes('bug')) {
      return 'debugging'
    }
    if (topics?.includes('implementation') || topics?.includes('feature')) {
      return 'implementation'
    }
    if (topics?.includes('refactoring') || topics?.includes('optimization')) {
      return 'refactoring'
    }
    return 'code_discussion'
  }
  
  if (tools?.includes('git') || tools?.includes('github')) {
    return 'version_control'
  }
  if (tools?.includes('test') || tools?.includes('jest')) {
    return 'testing'
  }
  
  if (topics?.includes('planning') || topics?.includes('requirements')) {
    return 'planning'
  }
  if (topics?.includes('documentation')) {
    return 'documentation'
  }
  
  return 'general'
}

// Neo4j connection helper
let driver: any = null

function getDriver() {
  if (!driver) {
    const NEO4J_URI = Deno.env.get('NEO4J_URI') || 'neo4j+s://eb61aceb.databases.neo4j.io'
    const NEO4J_USER = Deno.env.get('NEO4J_USER') || 'neo4j'
    const NEO4J_PASSWORD = Deno.env.get('NEO4J_PASSWORD')

    if (!NEO4J_PASSWORD) {
      throw new Error('NEO4J_PASSWORD environment variable is required')
    }

    driver = neo4j.driver(
      NEO4J_URI,
      neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD),
      {
        maxConnectionPoolSize: 100, // Increased for higher throughput
        connectionAcquisitionTimeout: 120000, // 2 minutes
        maxTransactionRetryTime: 60000, // 1 minute
      }
    )
  }
  return driver
}

async function executeQuery(query: string, parameters?: Record<string, any>) {
  const driver = getDriver()
  const session = driver.session()
  
  try {
    const result = await session.run(query, parameters || {})
    return {
      records: result.records.map((record: any) => record.toObject()),
      summary: result.summary
    }
  } finally {
    await session.close()
  }
}

// Background task processor
async function processMemoryBatch(chunks: any[], openai: OpenAI, supabase: any) {
  const results = []
  
  for (const chunk of chunks) {
    try {
      console.log(`[Process Embeddings] Processing chunk ${chunk.id}`, {
        chunk_id: chunk.chunk_id,
        workspace_id: chunk.workspace_id,
      })
      
      // Check if embedding already exists in metadata
      let embedding: number[] | null = null
      
      if (chunk.metadata?.embedding && Array.isArray(chunk.metadata.embedding)) {
        // Use pre-computed embedding if available
        embedding = chunk.metadata.embedding
        console.log(`[Process Embeddings] Using pre-computed embedding for chunk ${chunk.id}`)
      } else {
        // Generate embedding
        // Truncate content if it's too large
        // Be more aggressive with truncation - some content has worse char/token ratio
        let content = chunk.content
        const maxChars = 20000 // Much more conservative limit
        if (content.length > maxChars) {
          console.log(`[Process Embeddings] Truncating chunk ${chunk.id} from ${content.length} to ${maxChars} chars`)
          content = content.substring(0, maxChars)
        }
        
        try {
          const embeddingResponse = await openai.embeddings.create({
            model: 'text-embedding-3-large',
            input: content,
            dimensions: 3072,
          })
          
          embedding = embeddingResponse.data[0].embedding
        } catch (embeddingError: any) {
          // If we still hit token limit, truncate more aggressively
          if (embeddingError.status === 400 && embeddingError.message?.includes('maximum context length')) {
            console.log(`[Process Embeddings] Token limit hit for chunk ${chunk.id}, truncating to 10k chars`)
            content = chunk.content.substring(0, 10000)
            
            const embeddingResponse = await openai.embeddings.create({
              model: 'text-embedding-3-large',
              input: content,
              dimensions: 3072,
            })
            
            embedding = embeddingResponse.data[0].embedding
          } else {
            throw embeddingError
          }
        }
      }
      
      // Create memory node in Neo4j
      const memoryId = chunk.chunk_id || crypto.randomUUID()
      const now = new Date().toISOString()
      
      // Extract project name from metadata
      let projectName = chunk.metadata?.projectName || 
                       (chunk.metadata?.projectPath ? chunk.metadata.projectPath.split('/').pop() : null) ||
                       chunk.project_name ||
                       'default'
      
      // Extract user_id and team_id from metadata or workspace_id
      const userId = chunk.metadata?.userId || 
                    (chunk.workspace_id?.startsWith('user:') ? chunk.workspace_id.substring(5) : undefined)
      const teamId = chunk.metadata?.teamId || 
                    (chunk.workspace_id?.startsWith('team:') ? chunk.workspace_id.substring(5) : undefined)
      
      // Create memory node in Neo4j with MERGE to handle duplicates
      const query = `
        MERGE (m:Memory {id: $id})
        ON CREATE SET 
          m.content = $content,
          m.embedding = $embedding,
          m.project_name = $project_name,
          m.user_id = $user_id,
          m.team_id = $team_id,
          m.type = $type,
          m.chunk_id = $chunk_id,
          m.session_id = $session_id,
          m.created_at = $created_at,
          m.updated_at = $updated_at,
          m.metadata = $metadata
        ON MATCH SET
          m.content = $content,
          m.embedding = $embedding,
          m.project_name = $project_name,
          m.user_id = $user_id,
          m.team_id = $team_id,
          m.type = $type,
          m.chunk_id = $chunk_id,
          m.session_id = $session_id,
          m.updated_at = $updated_at,
          m.metadata = $metadata
        WITH m
        // Ensure project exists
        MERGE (p:Project {name: $project_name})
        ON CREATE SET p.id = randomUUID(),
                      p.total_memories = 0,
                      p.created_at = datetime()
        // Create project relationship
        MERGE (m)-[r:BELONGS_TO_PROJECT]->(p)
        SET r.created_at = datetime()
        WITH m, p
        WHERE $user_id IS NOT NULL
        // Ensure user exists if user_id provided
        MERGE (u:User {id: $user_id})
        ON CREATE SET u.created_at = datetime()
        // Create user relationship
        MERGE (u)-[r2:CREATED]->(m)
        SET r2.created_at = datetime()
        RETURN m
      `
      
      const params = {
        id: memoryId,
        content: chunk.content,
        embedding: embedding,
        project_name: projectName,
        user_id: userId || null,
        team_id: teamId || null,
        type: chunk.metadata?.messageType || chunk.metadata?.type || 'general',
        chunk_id: chunk.chunk_id || null,
        session_id: chunk.session_id || chunk.metadata?.sessionId || null,
        created_at: chunk.metadata?.startTime || chunk.metadata?.endTime || chunk.created_at || now,
        updated_at: now,
        metadata: JSON.stringify(chunk.metadata || {})
      }

      await executeQuery(query, params)
      
      // Mark as completed
      await supabase
        .from('memory_queue')
        .update({ 
          status: 'completed',
          processed_at: new Date().toISOString()
        })
        .eq('id', chunk.id)
      
      results.push({ success: true, id: chunk.id })
    } catch (error) {
      console.error(`[Process Embeddings] Error processing chunk ${chunk.id}:`, error)
      
      // Mark as failed with retry logic
      const shouldRetry = chunk.retry_count < MAX_RETRIES
      await supabase
        .from('memory_queue')
        .update({ 
          status: shouldRetry ? 'pending' : 'failed',
          error: error.message,
          retry_count: chunk.retry_count + 1
        })
        .eq('id', chunk.id)
      
      results.push({ success: false, id: chunk.id, error: error.message })
    }
  }
  
  return results
}

// Main background processing function
async function processEmbeddingsBackground(taskId: string) {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )
  
  const openai = new OpenAI({
    apiKey: Deno.env.get('OPENAI_API_KEY') ?? '',
  })
  
  console.log(`[Process Embeddings] Starting background task ${taskId}`)
  
  let totalProcessed = 0
  let totalErrors = 0
  
  try {
    // Keep processing until no more pending items
    while (true) {
      // Get pending chunks
      const { data: memoryChunks, error: memoryError } = await supabase
        .from('memory_queue')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(BATCH_SIZE)
      
      if (memoryError) {
        throw new Error(`Failed to get memory chunks: ${memoryError.message}`)
      }
      
      if (!memoryChunks || memoryChunks.length === 0) {
        console.log('[Process Embeddings] No more pending chunks to process')
        break
      }
      
      console.log(`[Process Embeddings] Processing batch of ${memoryChunks.length} chunks`)
      
      // Mark chunks as processing
      const chunkIds = memoryChunks.map(c => c.id)
      await supabase
        .from('memory_queue')
        .update({ status: 'processing' })
        .in('id', chunkIds)
      
      // Process chunks in parallel batches
      const batchPromises = []
      for (let i = 0; i < memoryChunks.length; i += PARALLEL_WORKERS) {
        const batch = memoryChunks.slice(i, i + PARALLEL_WORKERS)
        batchPromises.push(
          processMemoryBatch(batch, openai, supabase).catch(error => {
            console.error(`[Process Embeddings] Batch processing error:`, error)
            // Return failed results for this batch
            return batch.map(chunk => ({
              success: false,
              id: chunk.id,
              error: error.message
            }))
          })
        )
      }
      
      const batchResults = await Promise.all(batchPromises)
      const results = batchResults.flat()
      
      const successCount = results.filter(r => r.success).length
      const errorCount = results.filter(r => !r.success).length
      
      totalProcessed += successCount
      totalErrors += errorCount
      
      console.log(`[Process Embeddings] Batch complete - Success: ${successCount}, Errors: ${errorCount}`)
      
      // If we processed less than BATCH_SIZE, we're likely done
      if (memoryChunks.length < BATCH_SIZE) {
        console.log('[Process Embeddings] Processed all available chunks')
        break
      }
    }
    
    console.log(`[Process Embeddings] Task ${taskId} completed - Total processed: ${totalProcessed}, Total errors: ${totalErrors}`)
    
    // Trigger memory-code linking for processed memories
    if (totalProcessed > 0) {
      console.log('[Process Embeddings] Triggering memory-code linking for processed memories')
      try {
        // Get unique project names from processed memories
        const { data: processedMemories } = await supabase
          .from('memory_queue')
          .select('project_name')
          .eq('status', 'completed')
          .not('project_name', 'is', null)
          .limit(100)
        
        const projectNames = [...new Set(processedMemories?.map(m => m.project_name) || [])]
        
        // Trigger linking for each project
        for (const projectName of projectNames) {
          if (!projectName) continue
          
          console.log(`[Process Embeddings] Linking memories for project: ${projectName}`)
          
          const linkResponse = await fetch(
            `${Deno.env.get('SUPABASE_URL')}/functions/v1/link-memory-code`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                projectName,
                threshold: 0.7
              }),
            }
          )
          
          if (!linkResponse.ok) {
            console.error(`[Process Embeddings] Failed to trigger linking for ${projectName}: ${await linkResponse.text()}`)
          } else {
            const result = await linkResponse.json()
            console.log(`[Process Embeddings] Linked ${result.processed || 0} memories for ${projectName}`)
          }
        }
      } catch (linkError) {
        console.error('[Process Embeddings] Error triggering memory-code linking:', linkError)
        // Don't throw - this is a best-effort operation
      }
    }
    
  } catch (error) {
    console.error(`[Process Embeddings] Background task ${taskId} error:`, error)
    throw error
  } finally {
    // Close Neo4j driver connection
    if (driver) {
      await driver.close()
      driver = null
    }
  }
}

serve(async (req, connInfo) => {
  try {
    // Verify Neo4j connectivity first
    const driver = getDriver()
    await driver.verifyConnectivity()
    console.log('[Process Embeddings] Neo4j connection verified')
    
    // Create a unique task ID
    const taskId = crypto.randomUUID()
    
    // Use EdgeRuntime.waitUntil for proper background task handling
    const runtime = connInfo as any
    if (runtime?.waitUntil) {
      runtime.waitUntil(
        processEmbeddingsBackground(taskId).catch(error => {
          console.error(`[Process Embeddings] Background task ${taskId} failed:`, error)
        })
      )
    } else {
      // Fallback for local development or if waitUntil is not available
      processEmbeddingsBackground(taskId).catch(error => {
        console.error(`[Process Embeddings] Background task ${taskId} failed:`, error)
      })
    }
    
    // Return immediately
    return new Response(
      JSON.stringify({ 
        success: true, 
        taskId: taskId,
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