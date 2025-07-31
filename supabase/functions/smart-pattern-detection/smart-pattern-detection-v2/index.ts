import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import neo4j from 'https://unpkg.com/neo4j-driver@5.12.0/lib/browser/neo4j-web.esm.js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// CRITICAL: Handle user/workspace data duality
function getOwnershipFilter(params: {
  userId?: string
  workspaceId?: string
  nodeAlias?: string
}): string {
  const alias = params.nodeAlias || 'n'
  
  if (params.workspaceId && params.userId) {
    // User in workspace: get both personal and workspace data
    return `(${alias}.workspace_id = $workspaceId OR (${alias}.user_id = $userId AND ${alias}.workspace_id IS NULL))`
  } else if (params.userId) {
    // User not in workspace: only personal data
    return `(${alias}.user_id = $userId AND ${alias}.workspace_id IS NULL)`
  } else if (params.workspaceId) {
    // Only workspace specified
    return `${alias}.workspace_id = $workspaceId`
  } else {
    // No filter - for counting all data
    return 'true'
  }
}

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

// Process memories for all users
async function processAllMemories(driver: any, limit: number = 100) {
  const session = driver.session()
  let processed = 0
  
  try {
    // Get memories without summaries (no ownership filter for batch processing)
    const result = await session.run(`
      MATCH (m:Memory)
      WHERE m.content IS NOT NULL 
        AND m.embedding IS NOT NULL
        AND NOT EXISTS((m)<-[:SUMMARIZES]-(:EntitySummary))
      RETURN m
      ORDER BY m.created_at DESC
      LIMIT $limit
    `, { limit: neo4j.int(limit) })
    
    console.log(`Found ${result.records.length} memories to process`)
    
    for (const record of result.records) {
      const memory = record.get('m').properties
      
      // Extract keywords
      const keywords = extractKeywords(memory.content || '')
      
      // Create pattern signals
      const patternSignals = {
        is_debugging: keywords.error > 0 || keywords.bug > 0 || keywords.fix > 0,
        is_learning: keywords.learn > 0 || keywords.understand > 0,
        is_refactoring: keywords.refactor > 0 || keywords.improve > 0,
        complexity_score: 0.5,
        urgency_score: keywords.error > 2 ? 0.8 : 0.5
      }
      
      // Skip EntitySummary creation - this should be done only in ingestion workers
      // Pattern detection should only detect patterns, not create summaries
      
      processed++
    }
    
  } finally {
    await session.close()
  }
  
  return processed
}

// Process code entities
async function processAllCode(driver: any, limit: number = 100) {
  const session = driver.session()
  let processed = 0
  
  try {
    const result = await session.run(`
      MATCH (c:CodeEntity)
      WHERE c.content IS NOT NULL 
        AND c.embedding IS NOT NULL
        AND NOT EXISTS((c)<-[:SUMMARIZES]-(:EntitySummary))
      RETURN c
      ORDER BY c.created_at DESC
      LIMIT $limit
    `, { limit: neo4j.int(limit) })
    
    console.log(`Found ${result.records.length} code entities to process`)
    
    for (const record of result.records) {
      const code = record.get('c').properties
      
      const keywords = extractKeywords(code.content || '')
      const patternSignals = {
        is_debugging: false,
        is_learning: false,
        is_refactoring: keywords.refactor > 0,
        complexity_score: 0.5,
        urgency_score: 0.3
      }
      
      // Skip EntitySummary creation - this should be done only in ingestion workers
      // Pattern detection should only detect patterns, not create summaries
      
      processed++
    }
    
  } finally {
    await session.close()
  }
  
  return processed
}

// Detect patterns across all data
async function detectPatterns(driver: any) {
  const session = driver.session()
  const patterns: any[] = []
  
  try {
    // Get unique users and their data distribution
    const userStats = await session.run(`
      MATCH (n)
      WHERE (n:Memory OR n:CodeEntity) 
        AND (n.user_id IS NOT NULL OR n.workspace_id IS NOT NULL)
      WITH 
        COALESCE(n.user_id, 'workspace:' + n.workspace_id) as owner,
        labels(n)[0] as type,
        count(n) as count
      RETURN owner, type, count
      ORDER BY count DESC
    `)
    
    console.log('Data distribution:')
    userStats.records.forEach(record => {
      console.log(`  ${record.get('owner')}: ${record.get('count')} ${record.get('type')}`)
    })
    
    // Detect debugging patterns
    const debugResult = await session.run(`
      MATCH (e:EntitySummary)
      WHERE e.pattern_signals.is_debugging = true
      WITH e.user_id as userId,
           e.workspace_id as workspaceId,
           e.project_name as project,
           date(e.created_at) as day,
           count(e) as debugCount
      WHERE debugCount > 3
      RETURN userId, workspaceId, project, day, debugCount
      ORDER BY debugCount DESC
      LIMIT 20
    `)
    
    for (const record of debugResult.records) {
      const debugCount = record.get('debugCount')
      if (debugCount > 5) {
        patterns.push({
          type: 'debugging',
          pattern: 'debugging-activity',
          userId: record.get('userId'),
          workspaceId: record.get('workspaceId'),
          project: record.get('project'),
          day: record.get('day'),
          confidence: Math.min(debugCount / 10, 0.9),
          frequency: debugCount
        })
      }
    }
    
    // Store patterns
    for (const pattern of patterns) {
      const patternId = `${pattern.type}-${pattern.pattern}-${Date.now()}`
      await session.run(`
        CREATE (p:PatternSummary {
          id: $patternId,
          pattern_type: $type,
          pattern_name: $pattern,
          confidence: $confidence,
          frequency: $frequency,
          first_detected: datetime(),
          last_validated: datetime(),
          last_updated: datetime(),
          scope_type: 'analysis',
          scope_id: $scopeId,
          metadata: $metadata
        })
      `, {
        patternId,
        type: pattern.type,
        pattern: pattern.pattern,
        confidence: pattern.confidence,
        frequency: pattern.frequency,
        scopeId: pattern.userId || pattern.workspaceId || 'global',
        metadata: {
          project: pattern.project,
          day: pattern.day?.toString()
        }
      })
    }
    
  } finally {
    await session.close()
  }
  
  return patterns
}

function extractKeywords(content: string): Record<string, number> {
  const keywords: Record<string, number> = {}
  const importantWords = [
    'error', 'bug', 'fix', 'debug', 'issue', 'problem',
    'learn', 'understand', 'study', 'research', 'explore',
    'refactor', 'improve', 'optimize', 'clean', 'restructure'
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()
  
  try {
    const { operation = 'all', limit = 100 } = await req.json().catch(() => ({}))
    
    const driver = getNeo4jDriver()
    const results: any = {
      timestamp: new Date().toISOString(),
      operation,
      processed: {}
    }
    
    switch (operation) {
      case 'summaries':
        // Process memories
        const memoriesProcessed = await processAllMemories(driver, limit)
        results.processed.memories = memoriesProcessed
        
        // Process code
        const codeProcessed = await processAllCode(driver, limit)
        results.processed.code = codeProcessed
        break
        
      case 'patterns':
        // Detect patterns
        const patterns = await detectPatterns(driver)
        results.patterns = patterns
        results.patternCount = patterns.length
        break
        
      case 'all':
      default:
        // Do everything
        const mem = await processAllMemories(driver, limit)
        const code = await processAllCode(driver, limit)
        results.processed = { memories: mem, code }
        
        if (mem > 0 || code > 0) {
          const pats = await detectPatterns(driver)
          results.patterns = pats
          results.patternCount = pats.length
        }
        break
    }
    
    await driver.close()
    
    results.processingTime = Date.now() - startTime
    
    return new Response(
      JSON.stringify(results),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Pattern detection error:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message,
        stack: error.stack,
        processingTime: Date.now() - startTime
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})