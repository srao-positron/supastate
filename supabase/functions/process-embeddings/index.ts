/**
 * Edge Function to process memory embeddings and store them in Neo4j
 * Uses background tasks to avoid timeout limitations
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import OpenAI from 'https://deno.land/x/openai@v4.20.1/mod.ts'
// Use unpkg CDN version that works with Deno - ESM build
import neo4j from 'https://unpkg.com/neo4j-driver@5.12.0/lib/browser/neo4j-web.esm.js'

const BATCH_SIZE = 100
const PARALLEL_WORKERS = 10

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
        maxConnectionPoolSize: 50,
        connectionAcquisitionTimeout: 60000,
        maxTransactionRetryTime: 30000,
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

// Ingestion helper functions
async function ensureProjectExists(projectName: string): Promise<void> {
  const query = `
    MERGE (p:Project {name: $projectName})
    ON CREATE SET p.id = randomUUID(),
                  p.total_memories = 0,
                  p.created_at = datetime()
    ON MATCH SET p.updated_at = datetime()
    RETURN p
  `
  
  await executeQuery(query, { projectName })
}

async function createUserRelationship(userId: string, memoryId: string): Promise<void> {
  // First ensure user exists
  await executeQuery(`
    MERGE (u:User {id: $userId})
    ON CREATE SET u.created_at = datetime()
    RETURN u
  `, { userId })

  const query = `
    MATCH (u:User {id: $userId})
    MATCH (m:Memory {id: $memoryId})
    MERGE (u)-[r:CREATED]->(m)
    SET r.created_at = datetime()
    RETURN r
  `
  
  await executeQuery(query, { userId, memoryId })
}

async function createProjectRelationship(memoryId: string, projectName: string): Promise<void> {
  const query = `
    MATCH (m:Memory {id: $memoryId})
    MATCH (p:Project {name: $projectName})
    MERGE (m)-[r:BELONGS_TO_PROJECT]->(p)
    SET r.created_at = datetime()
    WITH p
    SET p.total_memories = p.total_memories + 1
    RETURN p
  `
  
  await executeQuery(query, { memoryId, projectName })
}

async function createMemoryNode(data: {
  id: string
  content: string
  embedding: number[]
  project_name: string
  user_id?: string
  team_id?: string
  type?: string
  metadata?: Record<string, any>
  created_at: string
  updated_at: string
  chunk_id?: string
  session_id?: string
}) {
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
    RETURN m
  `
  
  const params = {
    id: data.id,
    content: data.content,
    embedding: data.embedding,
    project_name: data.project_name,
    user_id: data.user_id || null,
    team_id: data.team_id || null,
    type: data.type || 'general',
    chunk_id: data.chunk_id || null,
    session_id: data.session_id || null,
    created_at: data.created_at,
    updated_at: data.updated_at,
    metadata: JSON.stringify(data.metadata || {})
  }

  const result = await executeQuery(query, params)
  
  if (!result.records.length) {
    throw new Error('Failed to create memory node')
  }
  
  return result.records[0].m
}

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
    // Process memory chunks from queue
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
          console.log(`[Process Embeddings] Processing chunk ${chunk.id}`, {
            chunk_id: chunk.chunk_id,
            workspace_id: chunk.workspace_id,
            has_metadata: !!chunk.metadata,
            metadata_project: chunk.metadata?.projectName,
            metadata_userId: chunk.metadata?.userId,
            metadata_teamId: chunk.metadata?.teamId
          })
          
          // Check if embedding already exists in metadata
          let embedding: number[] | null = null
          
          if (chunk.metadata?.embedding && Array.isArray(chunk.metadata.embedding)) {
            // Use pre-computed embedding if available
            embedding = chunk.metadata.embedding
            console.log(`[Process Embeddings] Using pre-computed embedding for chunk ${chunk.id}`)
          } else {
            // Generate embedding
            // Truncate content if it's too large (roughly 4 chars per token)
            let content = chunk.content
            const maxChars = 8192 * 4 // ~32k characters for 8k tokens
            if (content.length > maxChars) {
              console.log(`[Process Embeddings] Truncating chunk ${chunk.id} from ${content.length} to ${maxChars} chars`)
              content = content.substring(0, maxChars)
            }
            
            const embeddingResponse = await openai.embeddings.create({
              model: 'text-embedding-3-large',
              input: content,
              dimensions: 3072,
            })
            
            embedding = embeddingResponse.data[0].embedding
          }
          
          // Create memory node in Neo4j
          const memoryId = chunk.chunk_id || crypto.randomUUID()
          const now = new Date().toISOString()
          
          // Extract project name from metadata (can be projectName or projectPath)
          let projectName = chunk.metadata?.projectName || 
                           (chunk.metadata?.projectPath ? chunk.metadata.projectPath.split('/').pop() : null) ||
                           chunk.project_name ||
                           'default'
          
          // Extract user_id and team_id from metadata or workspace_id
          const userId = chunk.metadata?.userId || 
                        (chunk.workspace_id?.startsWith('user:') ? chunk.workspace_id.substring(5) : undefined)
          const teamId = chunk.metadata?.teamId || 
                        (chunk.workspace_id?.startsWith('team:') ? chunk.workspace_id.substring(5) : undefined)
          
          await createMemoryNode({
            id: memoryId,
            content: chunk.content,
            embedding: embedding,
            project_name: projectName,
            user_id: userId,
            team_id: teamId,
            type: chunk.metadata?.messageType || 'general',
            chunk_id: chunk.chunk_id,
            session_id: chunk.session_id,
            metadata: chunk.metadata || {},
            created_at: chunk.created_at || now,
            updated_at: now
          })
          
          // Create relationships
          
          await ensureProjectExists(projectName)
          await createProjectRelationship(memoryId, projectName)
          
          // Create user relationship if user_id exists
          if (userId) {
            await createUserRelationship(userId, memoryId)
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
  } finally {
    // Close Neo4j driver connection
    if (driver) {
      await driver.close()
      driver = null
    }
  }
}

serve(async (req) => {
  try {
    // Verify Neo4j connectivity first
    const driver = getDriver()
    await driver.verifyConnectivity()
    console.log('[Process Embeddings] Neo4j connection verified')
    
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