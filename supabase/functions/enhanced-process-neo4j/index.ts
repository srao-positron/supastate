import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import neo4j from 'https://unpkg.com/neo4j-driver@5.12.0/lib/browser/neo4j-web.esm.js'
import OpenAI from 'https://deno.land/x/openai@v4.20.1/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: Deno.env.get('OPENAI_API_KEY'),
})

// Initialize Neo4j driver
function getNeo4jDriver() {
  const NEO4J_URI = Deno.env.get('NEO4J_URI') || 'neo4j+s://eb61aceb.databases.neo4j.io'
  const NEO4J_USER = Deno.env.get('NEO4J_USER') || 'neo4j'
  const NEO4J_PASSWORD = Deno.env.get('NEO4J_PASSWORD')

  if (!NEO4J_PASSWORD) {
    throw new Error('NEO4J_PASSWORD environment variable is required')
  }

  return neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD),
    {
      maxConnectionPoolSize: 50,
      connectionAcquisitionTimeout: 60000,
      maxTransactionRetryTime: 30000
    }
  )
}

// Helper to create entity summaries
async function createEntitySummary(
  entity: any,
  entityType: 'memory' | 'code',
  driver: any,
  llmAnalysis?: any
) {
  const summaryId = crypto.randomUUID()
  const session = driver.session()
  
  try {
    // Extract keywords using simple frequency analysis
    const keywords = extractKeywords(entity.content)
    
    // Determine pattern signals based on content and LLM analysis
    const patternSignals = {
      is_debugging: llmAnalysis?.intent === 'debugging' || 
                   keywords.error > 5 || keywords.bug > 3,
      is_learning: llmAnalysis?.intent === 'learning' || 
                  keywords.learn > 2 || keywords.understand > 2,
      is_refactoring: llmAnalysis?.intent === 'refactoring' || 
                     keywords.refactor > 2 || keywords.improve > 2,
      complexity_score: llmAnalysis?.complexity || 0.5,
      urgency_score: llmAnalysis?.urgency || 0.5
    }
    
    await session.run(`
      CREATE (s:EntitySummary {
        id: $summaryId,
        entity_id: $entityId,
        entity_type: $entityType,
        user_id: $userId,
        team_id: $teamId,
        workspace_id: $workspaceId,
        project_name: $projectName,
        created_at: datetime(),
        updated_at: datetime(),
        embedding: $embedding,
        semantic_cluster_id: $clusterId,
        keyword_frequencies: $keywords,
        entity_references: $references,
        temporal_context: $temporalContext,
        pattern_signals: $patternSignals
      })
      WITH s
      MATCH (e {id: $entityId})
      CREATE (s)-[:SUMMARIZES]->(e)
      RETURN s.id as summaryId
    `, {
      summaryId,
      entityId: entity.id,
      entityType,
      userId: entity.user_id || null,
      teamId: entity.team_id || null,
      workspaceId: entity.workspace_id,
      projectName: entity.project_name || 'default',
      embedding: entity.embedding,
      clusterId: null, // Will be assigned by clustering process
      keywords: keywords,
      references: entity.entity_references || [],
      temporalContext: entity.temporal_context || null,
      patternSignals: patternSignals
    })
    
    return summaryId
  } finally {
    await session.close()
  }
}

// Simple keyword extraction
function extractKeywords(content: string): Record<string, number> {
  const keywords: Record<string, number> = {}
  const importantWords = [
    'error', 'bug', 'fix', 'debug', 'issue', 'problem',
    'learn', 'understand', 'study', 'research', 'explore',
    'refactor', 'improve', 'optimize', 'clean', 'restructure',
    'build', 'create', 'implement', 'develop', 'feature',
    'test', 'verify', 'check', 'validate', 'ensure'
  ]
  
  const lowerContent = content.toLowerCase()
  for (const word of importantWords) {
    const regex = new RegExp(`\\b${word}\\w*\\b`, 'gi')
    const matches = lowerContent.match(regex)
    if (matches) {
      keywords[word] = matches.length
    }
  }
  
  return keywords
}

// Update session tracking
async function updateSessionTracking(
  entity: any,
  entityType: 'memory' | 'code',
  driver: any
) {
  const session = driver.session()
  
  try {
    // Find or create session based on temporal proximity
    const sessionResult = await session.run(`
      MATCH (s:SessionSummary)
      WHERE s.user_id = $userId
        AND s.project_name = $projectName
        AND s.end_time > datetime() - duration({minutes: 30})
      RETURN s
      ORDER BY s.end_time DESC
      LIMIT 1
    `, {
      userId: entity.user_id,
      projectName: entity.project_name || 'default'
    })
    
    let sessionId: string
    
    if (sessionResult.records.length > 0) {
      // Update existing session
      sessionId = sessionResult.records[0].get('s').properties.id
      await session.run(`
        MATCH (s:SessionSummary {id: $sessionId})
        SET s.end_time = datetime(),
            s.entity_count = s.entity_count + 1,
            s.updated_at = datetime()
      `, { sessionId })
    } else {
      // Create new session
      sessionId = crypto.randomUUID()
      await session.run(`
        CREATE (s:SessionSummary {
          id: $sessionId,
          user_id: $userId,
          project_name: $projectName,
          start_time: datetime(),
          end_time: datetime(),
          entity_count: 1,
          dominant_patterns: [],
          keywords: {}
        })
      `, {
        sessionId,
        userId: entity.user_id,
        projectName: entity.project_name || 'default'
      })
    }
    
    return sessionId
  } finally {
    await session.close()
  }
}

// Enhanced memory processing with summarization
async function processMemoryWithSummary(item: any, driver: any, supabase: any) {
  const session = driver.session()
  
  try {
    // Generate embedding
    const embeddingResponse = await openai.embeddings.create({
      input: item.content,
      model: 'text-embedding-3-large',
      dimensions: 3072
    })
    const embedding = embeddingResponse.data[0].embedding
    
    // Quick LLM analysis for pattern detection (optional - can be done in background)
    let llmAnalysis = null
    if (item.content.length > 100) { // Only analyze substantial content
      try {
        const analysisResponse = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{
            role: 'system',
            content: 'Analyze this memory and return JSON with: intent (debugging/learning/building/refactoring), urgency (0-1), complexity (0-1), key_concepts (array)'
          }, {
            role: 'user',
            content: item.content.substring(0, 1000) // Limit for cost
          }],
          response_format: { type: 'json_object' },
          max_tokens: 100,
          temperature: 0.3
        })
        
        llmAnalysis = JSON.parse(analysisResponse.choices[0].message.content || '{}')
      } catch (error) {
        console.error('LLM analysis failed:', error)
      }
    }
    
    // Get workspace info
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('owner_id, team_id')
      .eq('id', item.workspace_id)
      .single()
    
    // Create memory in Neo4j
    const memoryResult = await session.run(`
      MERGE (m:Memory {chunk_id: $chunk_id, workspace_id: $workspace_id})
      SET m.id = COALESCE(m.id, randomUUID()),
          m.content = $content,
          m.embedding = $embedding,
          m.project_name = $project_name,
          m.user_id = $user_id,
          m.team_id = $team_id,
          m.session_id = $session_id,
          m.chunk_index = $chunk_index,
          m.type = $type,
          m.metadata = $metadata,
          m.created_at = COALESCE(m.created_at, datetime()),
          m.occurred_at = COALESCE(datetime($occurred_at), datetime()),
          m.updated_at = datetime()
      RETURN m
    `, {
      chunk_id: item.chunk_id,
      workspace_id: item.workspace_id,
      content: item.content,
      embedding: embedding,
      project_name: item.project_name || 'default',
      user_id: workspace?.owner_id || null,
      team_id: workspace?.team_id || null,
      session_id: item.session_id || null,
      chunk_index: item.chunk_index || 0,
      type: item.metadata?.type || 'general',
      metadata: JSON.stringify(item.metadata || {}),
      occurred_at: item.metadata?.occurredAt || new Date().toISOString()
    })
    
    const memory = memoryResult.records[0].get('m').properties
    
    // Create entity summary
    await createEntitySummary(memory, 'memory', driver, llmAnalysis)
    
    // Update session tracking
    await updateSessionTracking(memory, 'memory', driver)
    
    // Queue for pattern detection (async)
    await supabase
      .from('pattern_detection_queue')
      .insert({
        entity_id: memory.id,
        entity_type: 'memory',
        workspace_id: item.workspace_id,
        project_name: item.project_name || 'default',
        priority: llmAnalysis?.urgency || 0.5,
        status: 'pending'
      })
    
    return memory.id
  } finally {
    await session.close()
  }
}

// Enhanced code processing with summarization
async function processCodeWithSummary(
  entity: any, 
  file: any, 
  driver: any, 
  supabase: any
) {
  const session = driver.session()
  
  try {
    // Quick LLM analysis for code patterns
    let llmAnalysis = null
    if (entity.content.length > 50) {
      try {
        const analysisResponse = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{
            role: 'system',
            content: 'Analyze this code entity and return JSON with: purpose (string), design_patterns (array), complexity (0-1), quality (0-1)'
          }, {
            role: 'user',
            content: `${entity.type}: ${entity.name}\n${entity.signature || ''}\n${entity.content.substring(0, 500)}`
          }],
          response_format: { type: 'json_object' },
          max_tokens: 100,
          temperature: 0.3
        })
        
        llmAnalysis = JSON.parse(analysisResponse.choices[0].message.content || '{}')
      } catch (error) {
        console.error('Code LLM analysis failed:', error)
      }
    }
    
    // Create entity summary
    const codeEntity = {
      ...entity,
      workspace_id: file.workspace_id,
      project_name: file.project_name,
      user_id: file.user_id,
      team_id: file.team_id
    }
    
    await createEntitySummary(codeEntity, 'code', driver, llmAnalysis)
    
    // Queue for pattern detection
    await supabase
      .from('pattern_detection_queue')
      .insert({
        entity_id: entity.id,
        entity_type: 'code',
        workspace_id: file.workspace_id,
        project_name: file.project_name,
        priority: llmAnalysis?.complexity || 0.5,
        status: 'pending'
      })
    
  } finally {
    await session.close()
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Get items from memory queue
    const { data: queueItems, error: queueError } = await supabaseClient
      .from('memory_queue')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(25) // Smaller batch for enhanced processing

    if (queueError) throw queueError

    if (!queueItems || queueItems.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No items to process' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Processing ${queueItems.length} memory queue items with enhanced pipeline`)

    const driver = getNeo4jDriver()
    const processedIds: string[] = []
    const errors: any[] = []

    // Process each queue item with enhanced pipeline
    for (const item of queueItems) {
      try {
        // Mark as processing
        await supabaseClient
          .from('memory_queue')
          .update({ status: 'processing' })
          .eq('id', item.id)

        // Process with summary creation
        const memoryId = await processMemoryWithSummary(item, driver, supabaseClient)

        // Mark as completed
        await supabaseClient
          .from('memory_queue')
          .update({ 
            status: 'completed',
            processed_at: new Date().toISOString()
          })
          .eq('id', item.id)

        // Record in processed_memories
        if (item.metadata?.contentHash || item.content_hash) {
          await supabaseClient
            .from('processed_memories')
            .upsert({
              workspace_id: item.workspace_id,
              project_name: item.project_name || 'default',
              chunk_id: item.chunk_id,
              content_hash: item.metadata?.contentHash || item.content_hash,
              neo4j_node_id: memoryId,
              processed_at: new Date().toISOString()
            }, {
              onConflict: 'workspace_id,project_name,chunk_id'
            })
        }

        processedIds.push(item.id)

      } catch (error) {
        console.error(`Error processing item ${item.id}:`, error)
        errors.push({ id: item.id, error: error.message })

        await supabaseClient
          .from('memory_queue')
          .update({ 
            status: 'failed',
            error: error.message,
            retry_count: (item.retry_count || 0) + 1
          })
          .eq('id', item.id)
      }
    }

    await driver.close()

    // Trigger background pattern detection if items were processed
    if (processedIds.length > 0) {
      fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/detect-patterns-batch`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ trigger: 'memory_processing' })
      }).catch(err => console.error('Failed to trigger pattern detection:', err))
    }

    return new Response(
      JSON.stringify({
        processed: processedIds.length,
        failed: errors.length,
        processedIds,
        errors
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in enhanced-process-neo4j:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})