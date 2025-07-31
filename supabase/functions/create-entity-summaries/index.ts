import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const batchId = crypto.randomUUID()
  
  try {
    // Parse request body
    const { workspace_id, user_id, entity_type, limit = 100 } = await req.json()
    
    // Initialize clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    const neo4jUri = Deno.env.get('NEO4J_URI')!
    const neo4jUser = Deno.env.get('NEO4J_USER')!
    const neo4jPassword = Deno.env.get('NEO4J_PASSWORD')!
    const driver = neo4j.driver(neo4jUri, neo4j.auth.basic(neo4jUser, neo4jPassword))
    
    const session = driver.session()
    let processed = 0
    
    try {
      if (entity_type === 'memory' || !entity_type) {
        // Process memories
        const memoryQuery = `
          MATCH (m:Memory)
          WHERE m.content IS NOT NULL 
            AND m.embedding IS NOT NULL
            AND NOT EXISTS((m)<-[:SUMMARIZES]-(:EntitySummary))
            ${workspace_id ? `AND m.workspace_id = '${workspace_id}'` : ''}
            ${user_id && !workspace_id ? `AND m.user_id = '${user_id}'` : ''}
          RETURN m
          ORDER BY m.created_at
          LIMIT ${neo4j.int(limit)}
        `
        
        const memoryResult = await session.run(memoryQuery)
        
        for (const record of memoryResult.records) {
          const memory = record.get('m').properties
          
          // Double check no summary exists
          const existingCheck = await session.run(`
            MATCH (s:EntitySummary {entity_id: $entityId, entity_type: 'memory'})
            RETURN s.id as id
          `, { entityId: memory.id })
          
          if (existingCheck.records.length > 0) {
            continue
          }
          
          // Extract keywords and signals
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
          
          // Create summary
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
              s.updated_at = datetime()
            WITH s, m
            MERGE (s)-[:SUMMARIZES]->(m)
          `, {
            summaryId,
            entityId: memory.id,
            userId: memory.user_id || null,
            workspaceId: memory.workspace_id || null,
            projectName: memory.project_name || 'default',
            embedding: memory.embedding,
            keywords: JSON.stringify(keywords),
            patternSignals: JSON.stringify(patternSignals)
          })
          
          processed++
        }
      }
      
      if (entity_type === 'code' || !entity_type) {
        // Process code entities
        const codeQuery = `
          MATCH (c:CodeEntity)
          WHERE c.content IS NOT NULL 
            AND NOT EXISTS((c)<-[:SUMMARIZES]-(:EntitySummary))
            ${workspace_id ? `AND c.workspace_id = '${workspace_id}'` : ''}
            ${user_id && !workspace_id ? `AND c.user_id = '${user_id}'` : ''}
          RETURN c
          ORDER BY c.created_at
          LIMIT ${neo4j.int(limit)}
        `
        
        const codeResult = await session.run(codeQuery)
        
        for (const record of codeResult.records) {
          const code = record.get('c').properties
          
          // Double check no summary exists
          const existingCheck = await session.run(`
            MATCH (s:EntitySummary {entity_id: $entityId, entity_type: 'code'})
            RETURN s.id as id
          `, { entityId: code.id })
          
          if (existingCheck.records.length > 0) {
            continue
          }
          
          // Extract keywords from code
          const contentText = code.content || ''
          const nameText = code.name || ''
          const keywords = extractKeywords(`${nameText} ${contentText}`)
          
          // Build embedding text
          const metadataObj = typeof code.metadata === 'string' ? JSON.parse(code.metadata) : code.metadata || {}
          const embeddingText = [
            nameText,
            code.file_path || '',
            ...(metadataObj.functions || []).map((f: any) => f.name),
            ...(metadataObj.classes || []).map((c: any) => c.name),
            ...(metadataObj.imports || []),
            ...(metadataObj.exports || []),
            ...(metadataObj.components || []).map((c: any) => c.name),
            ...(metadataObj.types || []).map((t: any) => t.name),
            contentText.slice(0, 500)
          ].filter(Boolean).join(' ')
          
          // Generate embedding
          const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
          if (!OPENAI_API_KEY) {
            console.error('OPENAI_API_KEY not configured')
            continue
          }
          
          const response = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
              input: embeddingText,
              model: 'text-embedding-3-large',
              dimensions: 3072
            })
          })
          
          if (!response.ok) {
            console.error('Failed to generate embedding:', await response.text())
            continue
          }
          
          const data = await response.json()
          const embedding = data.data[0].embedding
          
          // Create summary
          const summaryId = crypto.randomUUID()
          await session.run(`
            MATCH (c:CodeEntity {id: $entityId})
            MERGE (s:EntitySummary {
              entity_id: $entityId,
              entity_type: 'code'
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
              s.metadata = $metadata
            ON MATCH SET
              s.updated_at = datetime()
            WITH s, c
            MERGE (s)-[:SUMMARIZES]->(c)
          `, {
            summaryId,
            entityId: code.id,
            userId: code.user_id || null,
            workspaceId: code.workspace_id || null,
            projectName: code.project_name || code.name || 'default',
            embedding: embedding,
            keywords: JSON.stringify(keywords),
            metadata: code.metadata || '{}'
          })
          
          processed++
        }
      }
      
      return new Response(
        JSON.stringify({
          batchId,
          processed,
          entity_type: entity_type || 'all'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
      
    } finally {
      await session.close()
      await driver.close()
    }
    
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})