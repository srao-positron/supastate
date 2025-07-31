import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'
import neo4j from 'https://unpkg.com/neo4j-driver@5.12.0/lib/browser/neo4j-web.esm.js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Extract keywords from text
function extractKeywords(text: string): Record<string, number> {
  if (!text) return {}
  
  const lowerText = text.toLowerCase()
  const keywords: Record<string, number> = {}
  
  // Define keyword patterns to look for
  const patterns = {
    // Debugging patterns
    error: /\b(error|exception|fail|crash|bug)\b/g,
    debug: /\b(debug|trace|log|console)\b/g,
    fix: /\b(fix|patch|resolve|solve)\b/g,
    issue: /\b(issue|problem|trouble|wrong)\b/g,
    
    // Learning patterns
    learn: /\b(learn|study|understand|research)\b/g,
    implement: /\b(implement|build|create|develop)\b/g,
    understand: /\b(understand|comprehend|grasp)\b/g,
    
    // Architecture patterns
    architecture: /\b(architecture|structure|design)\b/g,
    pattern: /\b(pattern|paradigm|approach)\b/g,
    system: /\b(system|infrastructure|framework)\b/g,
    component: /\b(component|module|service)\b/g,
    
    // Refactoring patterns
    refactor: /\b(refactor|restructure|reorganize)\b/g,
    improve: /\b(improve|enhance|optimize)\b/g,
    clean: /\b(clean|tidy|organize)\b/g,
    
    // Other useful keywords
    test: /\b(test|testing|spec|unit)\b/g,
    deploy: /\b(deploy|deployment|production)\b/g,
    performance: /\b(performance|speed|latency|optimize)\b/g,
    security: /\b(security|auth|authentication|permission)\b/g,
  }
  
  // Count occurrences
  for (const [key, pattern] of Object.entries(patterns)) {
    const matches = lowerText.match(pattern)
    if (matches) {
      keywords[key] = matches.length
    }
  }
  
  return keywords
}

// Calculate complexity score
function calculateComplexity(text: string): number {
  if (!text) return 0
  
  const factors = {
    length: Math.min(text.length / 1000, 1) * 0.3,
    codeBlocks: (text.match(/```/g)?.length || 0) / 10 * 0.3,
    techTerms: (text.match(/\b(api|database|function|class|method|variable|async|promise|query|schema)\b/gi)?.length || 0) / 20 * 0.4
  }
  
  return Math.min(Object.values(factors).reduce((a, b) => a + b, 0), 1)
}

// Calculate urgency score
function calculateUrgency(keywords: Record<string, number>): number {
  const urgentKeywords = ['error', 'bug', 'crash', 'fail', 'fix', 'issue']
  const urgentCount = urgentKeywords.reduce((count, key) => count + (keywords[key] || 0), 0)
  return Math.min(urgentCount / 10, 1)
}

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
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
  )
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { memories, user_id, workspace_id } = await req.json()

    if (!memories || !Array.isArray(memories) || memories.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No memories provided' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    console.log(`[Ingest Memory to Neo4j] Processing ${memories.length} memories`)

    const driver = getNeo4jDriver()
    const session = driver.session()
    
    // Initialize Supabase for embeddings
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const results = []
    const errors = []

    try {
      for (const memory of memories) {
        try {
          // Generate embedding if not provided
          let embedding = memory.embedding
          if (!embedding) {
            console.log(`[Ingest Memory to Neo4j] Generating embedding for memory ${memory.id}`)
            
            const openAIKey = Deno.env.get('OPENAI_API_KEY')
            if (!openAIKey) {
              throw new Error('OPENAI_API_KEY not configured')
            }

            const openAIResponse = await fetch('https://api.openai.com/v1/embeddings', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${openAIKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                model: 'text-embedding-3-large',
                input: memory.content,
                dimensions: 3072
              })
            })

            if (!openAIResponse.ok) {
              throw new Error(`OpenAI API error: ${openAIResponse.statusText}`)
            }

            const embeddingData = await openAIResponse.json()
            embedding = embeddingData.data[0].embedding
          }

          // Create Memory node in Neo4j
          const result = await session.run(
            `
            MERGE (m:Memory {
              id: $id,
              workspace_id: $workspace_id
            })
            SET m.content = $content,
                m.chunk_id = $chunk_id,
                m.session_id = $session_id,
                m.project_name = $project_name,
                m.type = $type,
                m.embedding = $embedding,
                m.user_id = $user_id,
                m.created_at = datetime($created_at),
                m.occurred_at = datetime($occurred_at),
                m.metadata = $metadata
            RETURN m
            `,
            {
              id: memory.id,
              workspace_id: workspace_id || `user:${user_id}`,
              content: memory.content,
              chunk_id: memory.chunk_id,
              session_id: memory.session_id,
              project_name: memory.project_name,
              type: memory.type || 'general',
              embedding: embedding,
              user_id: user_id,
              created_at: memory.created_at || new Date().toISOString(),
              occurred_at: memory.metadata?.startTime || memory.occurred_at || memory.created_at || new Date().toISOString(),
              metadata: JSON.stringify(memory.metadata || {})
            }
          )

          console.log(`[Ingest Memory to Neo4j] Created Memory node for ${memory.id}`)

          // Create EntitySummary for this memory
          const keywords = extractKeywords(memory.content || '')
          const patternSignals = {
            is_debugging: keywords.error > 0 || keywords.bug > 0 || keywords.fix > 0,
            is_learning: keywords.learn > 0 || keywords.understand > 0 || keywords.study > 0,
            is_refactoring: keywords.refactor > 0 || keywords.improve > 0 || keywords.optimize > 0,
            is_architecture: keywords.architecture > 0 || keywords.design > 0 || keywords.pattern > 0,
            is_problem_solving: keywords.solve > 0 || keywords.investigate > 0 || keywords.why > 0,
            complexity_score: calculateComplexity(memory.content || ''),
            urgency_score: calculateUrgency(keywords)
          }
          
          const summaryId = crypto.randomUUID()
          await session.run(`
            MATCH (m:Memory {id: $entityId})
            MERGE (s:EntitySummary {
              entity_id: $entityId,
              entity_type: 'memory'
            })
            ON CREATE SET
              s.id = $summaryId,
              s.user_id = $userId,
              s.workspace_id = $workspaceId,
              s.project_name = $projectName,
              s.created_at = datetime(),
              s.updated_at = datetime(),
              s.processed_at = datetime(),
              s.embedding = $embedding,
              s.keyword_frequencies = $keywords,
              s.pattern_signals = $patternSignals
            ON MATCH SET
              s.updated_at = datetime(),
              s.processed_at = datetime()
            WITH m, s
            MERGE (s)-[:SUMMARIZES]->(m)
            MERGE (m)-[:HAS_SUMMARY]->(s)
          `, {
            summaryId,
            entityId: memory.id,
            userId: user_id || null,
            workspaceId: workspace_id || null,
            projectName: memory.project_name || 'default',
            embedding: embedding,
            keywords: JSON.stringify(keywords),
            patternSignals: JSON.stringify(patternSignals)
          })
          
          console.log(`[Ingest Memory to Neo4j] Created EntitySummary for memory ${memory.id}`)

          // Create Project node if it doesn't exist
          if (memory.project_name) {
            await session.run(
              `
              MERGE (p:Project {name: $project_name, workspace_id: $workspace_id})
              WITH p
              MATCH (m:Memory {id: $memory_id})
              MERGE (m)-[:BELONGS_TO_PROJECT]->(p)
              `,
              {
                project_name: memory.project_name,
                workspace_id: workspace_id || `user:${user_id}`,
                memory_id: memory.id
              }
            )
          }

          // Create User relationship if user_id provided
          if (user_id) {
            await session.run(
              `
              MERGE (u:User {id: $user_id})
              WITH u
              MATCH (m:Memory {id: $memory_id})
              MERGE (m)-[:CREATED_BY]->(u)
              `,
              {
                user_id: user_id,
                memory_id: memory.id
              }
            )
          }

          results.push({ id: memory.id, success: true })
        } catch (error) {
          console.error(`[Ingest Memory to Neo4j] Error processing memory ${memory.id}:`, error)
          errors.push({ id: memory.id, error: error.message })
        }
      }

      // Embeddings are already stored in Neo4j Memory nodes
      // No need to store them separately in Supabase

    } finally {
      await session.close()
      await driver.close()
    }

    console.log(`[Ingest Memory to Neo4j] Completed: ${results.length} success, ${errors.length} errors`)

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        errors: errors.length,
        results,
        errors
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[Ingest Memory to Neo4j] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})