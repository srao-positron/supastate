import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import neo4j from 'https://unpkg.com/neo4j-driver@5.12.0/lib/browser/neo4j-web.esm.js'
import { getOwnershipFilter, getOwnershipParams } from './query-patterns.ts'
import { DBLogger } from './db-logger.ts'
import { logger, setLogger } from './safe-logger.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Relationship limits to prevent explosion
const MAX_RELATIONSHIPS_PER_ENTITY = 25  // Max relationships any single entity can have
const MAX_RELATIONSHIPS_PER_BATCH = 100  // Max relationships to create in one pattern detection run
const MIN_SIMILARITY_THRESHOLD = 0.70    // Minimum similarity for semantic relationships (lowered from 0.75)
const MAX_SEMANTIC_CANDIDATES = 50       // Max candidates to consider for semantic matching

// Helper functions
function getTenantFilter(workspaceId?: string, userId?: string, alias: string = 'e'): string {
  if (!workspaceId && !userId) {
    // No filtering - process all data (for global pattern detection)
    return 'TRUE'
  }
  
  if (workspaceId) {
    // When workspace is provided, get workspace data AND user's personal data
    return `(${alias}.workspace_id = '${workspaceId}' OR (${alias}.user_id = '${userId}' AND ${alias}.workspace_id IS NULL))`
  } else if (userId) {
    // When only user is provided, get only their personal data
    return `(${alias}.user_id = '${userId}' AND ${alias}.workspace_id IS NULL)`
  }
  
  return 'TRUE'
}

function toNumber(value: any): number {
  if (value == null) return 0
  if (typeof value === 'number') return value
  if (value.low !== undefined) return value.low
  if (value.toNumber) return value.toNumber()
  return Number(value) || 0
}

function getValue(record: any, key: string): any {
  if (!record || !record._fields || !record._fieldLookup) return null
  const index = record._fieldLookup[key]
  if (index === undefined) return null
  return record._fields[index]
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
    { maxConnectionPoolSize: 50 }
  )
}

// Get or create checkpoint
async function getCheckpoint(supabase: any, checkpointType: string) {
  try {
    const { data, error } = await supabase
      .from('pattern_processing_checkpoints')
      .select('*')
      .eq('checkpoint_type', checkpointType)
      .single()
    
    if (error && error.code === 'PGRST116') {
      // Create new checkpoint
      const { data: newCheckpoint } = await supabase
        .from('pattern_processing_checkpoints')
        .insert({
          checkpoint_type: checkpointType,
          last_processed_at: new Date(0).toISOString(), // Start from beginning
          processed_count: 0,
          metadata: {}
        })
        .select()
        .single()
      
      return newCheckpoint
    }
    
    return data
  } catch (e) {
    console.warn('Checkpoint table not available, continuing without checkpoints')
    return null
  }
}

// Update checkpoint
async function updateCheckpoint(supabase: any, checkpointType: string, updates: any) {
  try {
    // If we're updating processed_count, we need to increment it
    if ('processed_count' in updates && typeof updates.processed_count === 'number') {
      // First get current count
      const { data: current } = await supabase
        .from('pattern_processing_checkpoints')
        .select('processed_count')
        .eq('checkpoint_type', checkpointType)
        .single()
      
      if (current) {
        updates.processed_count = (current.processed_count || 0) + updates.processed_count
      }
    }
    
    await supabase
      .from('pattern_processing_checkpoints')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('checkpoint_type', checkpointType)
  } catch (e) {
    console.warn('Could not update checkpoint:', e)
  }
}

// Helper to generate embeddings via OpenAI
async function generateEmbedding(text: string): Promise<number[] | null> {
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
  if (!OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY not configured')
    return null
  }

  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        input: text,
        model: 'text-embedding-3-large',
        dimensions: 3072
      })
    })

    if (!response.ok) {
      console.error('OpenAI embedding generation failed:', await response.text())
      return null
    }

    const data = await response.json()
    return data.data[0].embedding
  } catch (error) {
    console.error('Error generating embedding:', error)
    return null
  }
}

// REMOVED: processCodeEntities - moved to create-entity-summaries function
// This prevents duplicate EntitySummary creation when pattern detection runs
/* async function processCodeEntities(driver: any, supabase: any, limit: number = 100) {
  const session = driver.session()
  let processed = 0
  
  try {
    // Get code entities without summaries
    const result = await session.run(`
      MATCH (c:CodeEntity)
      WHERE c.content IS NOT NULL 
        AND NOT EXISTS((c)<-[:SUMMARIZES]-(:EntitySummary))
      RETURN c
      ORDER BY c.created_at
      LIMIT $limit
    `, { limit: neo4j.int(limit) })
    
    await logger.info(`Processing ${result.records.length} code entities...`, {
      functionName: 'processCodeEntities',
      entityCount: result.records.length
    })
    
    for (const record of result.records) {
      const codeNode = getValue(record, 'c')
      const code = codeNode?.properties || {}
      
      // First check if summary already exists (defensive check)
      const existingCheck = await session.run(`
        MATCH (s:EntitySummary {entity_id: $entityId, entity_type: 'code'})
        RETURN s.id as id
      `, { entityId: code.id })
      
      if (existingCheck.records.length > 0) {
        await logger.warn(`EntitySummary already exists for code entity ${code.id}, skipping`, {
          functionName: 'processCodeEntities',
          entityId: code.id
        })
        continue
      }
      
      // Extract keywords from code and metadata
      const contentText = code.content || ''
      const metadataObj = code.metadata ? JSON.parse(code.metadata) : {}
      
      // Build comprehensive text for embedding
      const embeddingText = [
        code.name || '',
        code.path || '',
        // Include function names
        ...(metadataObj.functions || []).map(f => f.name),
        // Include class names
        ...(metadataObj.classes || []).map(c => c.name),
        // Include component names
        ...(metadataObj.components || []).map(c => c.name),
        // Include type names
        ...(metadataObj.types || []).map(t => t.name),
        // Extract key content (first 500 chars)
        contentText.slice(0, 500)
      ].filter(Boolean).join(' ')
      
      // Generate embedding ONLY after confirming we need it
      const embedding = await generateEmbedding(embeddingText)
      if (!embedding) {
        await logger.warn(`Failed to generate embedding for code entity ${code.id}`, {
          functionName: 'processCodeEntities',
          entityId: code.id
        })
        continue
      }
      
      // Extract comprehensive keywords
      const keywords = extractKeywords(contentText)
      
      // Analyze pattern signals from parsed metadata
      const patternSignals = {
        has_imports: (metadataObj.imports || []).length > 0,
        has_exports: (metadataObj.exports || []).length > 0,
        has_functions: (metadataObj.functions || []).length > 0,
        has_classes: (metadataObj.classes || []).length > 0,
        has_components: (metadataObj.components || []).length > 0,
        has_types: (metadataObj.types || []).length > 0,
        has_api_calls: (metadataObj.apiCalls || []).length > 0,
        is_test_file: code.path?.includes('test') || code.path?.includes('spec'),
        is_config_file: code.path?.includes('config') || code.path?.endsWith('.json'),
        language: code.language || 'unknown',
        function_count: (metadataObj.functions || []).length,
        class_count: (metadataObj.classes || []).length,
        import_count: (metadataObj.imports || []).length
      }
      
      // Skip EntitySummary creation - this should be done only in ingestion workers
      // Pattern processor should only detect patterns, not create summaries
      
      processed++
    }
    
    return processed
  } catch (error) {
    await logger.error('Error processing code entities', {
      error: error.message,
      functionName: 'processCodeEntities'
    })
    throw error
  } finally {
    await session.close()
  }
} */

// REMOVED: processMemories - moved to create-entity-summaries function
// This prevents duplicate EntitySummary creation when pattern detection runs
/* async function processMemories(driver: any, supabase: any, limit: number = 100) {
  const session = driver.session()
  let processed = 0
  
  try {
    // Get memories without summaries
    const result = await session.run(`
      MATCH (m:Memory)
      WHERE m.content IS NOT NULL 
        AND m.embedding IS NOT NULL
        AND NOT EXISTS((m)<-[:SUMMARIZES]-(:EntitySummary))
      RETURN m
      ORDER BY m.created_at
      LIMIT $limit
    `, { limit: neo4j.int(limit) })
    
    await logger.info(`Processing ${result.records.length} memories...`, {
      functionName: 'processMemories',
      entityCount: result.records.length
    })
    
    for (const record of result.records) {
      const memoryNode = getValue(record, 'm')
      const memory = memoryNode?.properties || {}
      
      // First check if summary already exists (defensive check)
      const existingCheck = await session.run(`
        MATCH (s:EntitySummary {entity_id: $entityId, entity_type: 'memory'})
        RETURN s.id as id
      `, { entityId: memory.id })
      
      if (existingCheck.records.length > 0) {
        await logger.warn(`EntitySummary already exists for memory ${memory.id}, skipping`, {
          functionName: 'processMemories',
          entityId: memory.id
        })
        continue
      }
      
      // Extract comprehensive keywords
      const keywords = extractKeywords(memory.content || '')
      
      // Generate pattern signals
      const patternSignals = {
        is_debugging: keywords.error > 0 || keywords.bug > 0 || keywords.fix > 0,
        is_learning: keywords.learn > 0 || keywords.understand > 0 || keywords.study > 0,
        is_refactoring: keywords.refactor > 0 || keywords.improve > 0 || keywords.optimize > 0,
        is_architecture: keywords.architecture > 0 || keywords.design > 0 || keywords.pattern > 0,
        is_problem_solving: keywords.solve > 0 || keywords.investigate > 0 || keywords.why > 0,
        complexity_score: calculateComplexity(memory.content || ''),
        urgency_score: calculateUrgency(keywords)
      }
      
      // Skip EntitySummary creation - this should be done only in ingestion workers
      // Pattern processor should only detect patterns, not create summaries
      
      processed++
    }
    
  } finally {
    await session.close()
  }
  
  return processed
} */

// Extract comprehensive keywords
function extractKeywords(content: string): Record<string, number> {
  const keywords: Record<string, number> = {}
  const categories = {
    debugging: ['error', 'bug', 'fix', 'debug', 'issue', 'problem', 'broken', 'fail', 'crash'],
    learning: ['learn', 'understand', 'study', 'research', 'explore', 'tutorial', 'documentation', 'how', 'why'],
    refactoring: ['refactor', 'improve', 'optimize', 'clean', 'restructure', 'reorganize', 'simplify'],
    architecture: ['architecture', 'design', 'pattern', 'structure', 'system', 'component', 'module', 'interface'],
    problem_solving: ['solve', 'solution', 'investigate', 'analyze', 'approach', 'strategy', 'implement']
  }
  
  const lowerContent = content.toLowerCase()
  
  Object.values(categories).flat().forEach(word => {
    const regex = new RegExp(`\\b${word}\\w*\\b`, 'gi')
    const matches = lowerContent.match(regex)
    if (matches) {
      keywords[word] = matches.length
    }
  })
  
  return keywords
}

function calculateComplexity(content: string): number {
  // Simple complexity based on length and structure
  const lines = content.split('\n').length
  const words = content.split(/\s+/).length
  const codeBlocks = (content.match(/```/g) || []).length / 2
  
  return Math.min(1, (lines / 50 + words / 200 + codeBlocks / 3) / 3)
}

function calculateUrgency(keywords: Record<string, number>): number {
  const urgentWords = ['error', 'bug', 'crash', 'fail', 'broken', 'issue']
  const urgentCount = urgentWords.reduce((sum, word) => sum + (keywords[word] || 0), 0)
  return Math.min(1, urgentCount / 5)
}

// Detect various patterns
async function detectPatterns(driver: any, batchId: string, logger: any, workspaceId?: string, userId?: string, patternTypes?: string[]) {
  const patterns: any[] = []
  const session = driver.session()
  
  // Extract userId from workspace_id if it's in "user:id" format
  if (workspaceId && workspaceId.startsWith('user:')) {
    userId = workspaceId.substring(5)
    // Keep workspaceId as is - don't set to undefined
  }
  
  try {
    // If no pattern types specified, run default lightweight detectors
    const typesToRun = patternTypes || ['debugging', 'learning', 'memory_code']
    
    await logger.info(`Running pattern detection for types: ${typesToRun.join(', ')}`, {
      functionName: 'detectPatterns',
      patternTypes: typesToRun
    })
    
    // Run requested pattern detectors
    if (typesToRun.includes('debugging')) {
      try {
        const debugPatterns = await detectDebuggingPatternsKeywordOnly(session, logger, workspaceId, userId)
        patterns.push(...debugPatterns)
        await logger.info(`Found ${debugPatterns.length} debugging patterns`)
      } catch (error) {
        await logger.error('Debugging pattern detection failed', error)
      }
    }
    
    if (typesToRun.includes('learning')) {
      try {
        const learningPatterns = await detectLearningPatterns(session, workspaceId, userId)
        patterns.push(...learningPatterns)
        await logger.info(`Found ${learningPatterns.length} learning patterns`)
      } catch (error) {
        await logger.error('Learning pattern detection failed', error)
      }
    }
    
    if (typesToRun.includes('memory_code')) {
      try {
        await logger.info('Starting memory-code relationship detection...')
        const memoryCodePatterns = await detectMemoryCodeRelationships(session, workspaceId, userId)
        patterns.push(...memoryCodePatterns)
        await logger.info(`Found ${memoryCodePatterns.length} memory-code relationship patterns`)
      } catch (error) {
        await logger.error('Memory-code relationship detection failed', error)
      }
    }
    
    // Other pattern types can be added here when ready:
    // - refactoring
    // - temporal
    // - semantic
    // - problem_solving
    
    // Store all patterns in batches
    await logger.info(`Storing ${patterns.length} patterns...`, {
      patternCount: patterns.length,
      batchId
    })
    
    // Batch patterns to avoid memory issues
    const BATCH_SIZE = 5  // Reduced batch size
    for (let i = 0; i < patterns.length; i += BATCH_SIZE) {
      const batch = patterns.slice(i, i + BATCH_SIZE)
      await storePatternBatch(session, batch, batchId)
      await logger.info(`Stored batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(patterns.length/BATCH_SIZE)}`, {
        batchNumber: Math.floor(i/BATCH_SIZE) + 1,
        totalBatches: Math.ceil(patterns.length/BATCH_SIZE)
      })
      
      // Add delay between batches to let Neo4j recover
      if (i + BATCH_SIZE < patterns.length) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }
    
    await logger.info(`All patterns stored for batch ${batchId}`, {
      patternCount: patterns.length,
      batchId
    })
    
  } finally {
    await session.close()
  }
  
  return patterns
}

async function detectDebuggingPatterns(session: any, workspaceId?: string, userId?: string) {
  const patterns = []
  const tenantFilter = getTenantFilter(workspaceId, userId)
  
  await logger.info('Starting debugging pattern detection...', { functionName: 'detectDebuggingPatterns' })
  
  // First, get some known debugging examples to use as seeds
  // Using a lower urgency threshold to get more seeds
  // Apply tenant filtering to ensure we only process data within the same workspace/user context
  const debugSeeds = await session.run(`
    MATCH (e:EntitySummary)
    WHERE e.pattern_signals CONTAINS '"is_debugging":true'
      AND e.embedding IS NOT NULL
      ${tenantFilter !== 'TRUE' ? `AND ${tenantFilter}` : ''}
    RETURN e.id as id, e.embedding as embedding
    ORDER BY e.created_at DESC
    LIMIT 10
  `)
  
  await logger.info(`Debug seeds query returned ${debugSeeds.records.length} records`, { 
    functionName: 'detectDebuggingPatterns',
    entityCount: debugSeeds.records.length
  })
  
  if (debugSeeds.records.length === 0) {
    await logger.warn('No debugging seeds found, using keyword-only detection', { functionName: 'detectDebuggingPatterns' })
    // Fall back to keyword-only detection
    return await detectDebuggingPatternsKeywordOnly(session, logger, workspaceId, userId)
  }
  
  // Use semantic similarity to find more debugging memories
  await logger.info(`Found ${debugSeeds.records.length} debugging seeds for semantic similarity search`, {
    functionName: 'detectDebuggingPatterns',
    entityCount: debugSeeds.records.length
  })
  
  for (const seedRecord of debugSeeds.records) {
    const seedEmbedding = getValue(seedRecord, 'embedding')
    if (!seedEmbedding) {
      await logger.warn('Skipping seed without embedding', { functionName: 'detectDebuggingPatterns' })
      continue
    }
    
    // Find similar memories using GDS cosine similarity
    const seedId = getValue(seedRecord, 'id')
    if (!seedId) {
      await logger.warn('Skipping seed without ID', { functionName: 'detectDebuggingPatterns' })
      continue
    }
    
    // Use vector index for efficient similarity search (Neo4j 5.11+)
    await logger.debug(`Searching similar entities for seed ${seedId}...`, { 
      functionName: 'detectDebuggingPatterns',
      seedId 
    })
    const startTime = Date.now()
    
    try {
      // First get the seed embedding
      const seedResult = await session.run(`
        MATCH (seed:EntitySummary {id: $seedId})
        RETURN seed.embedding as embedding
      `, { seedId })
      
      if (seedResult.records.length === 0 || !seedResult.records[0].get('embedding')) {
        await logger.warn(`Seed ${seedId} has no embedding`, { 
          functionName: 'detectDebuggingPatterns',
          seedId 
        })
        continue
      }
      
      const seedEmbedding = seedResult.records[0].get('embedding')
      
      // Use vector.similarity.cosine for proper semantic search
      // Optimized query: aggregate results directly to reduce memory usage
      const similarResult = await session.run(`
        MATCH (seed:EntitySummary {id: $seedId})
        WHERE seed.embedding IS NOT NULL
        WITH seed, seed.embedding AS seedEmbedding
        MATCH (e:EntitySummary)
        WHERE e.id <> seed.id
          AND e.embedding IS NOT NULL
          AND e.created_at > datetime() - duration('P30D')  // Only last 30 days to reduce scope
          AND vector.similarity.cosine(seedEmbedding, e.embedding) > 0.7  // Higher threshold
          ${tenantFilter !== 'TRUE' ? `AND ${tenantFilter}` : ''}
        WITH e.user_id as userId,
             e.workspace_id as workspaceId, 
             e.project_name as project,
             toString(date(e.created_at).week) as week,
             avg(vector.similarity.cosine(seedEmbedding, e.embedding)) as avgSimilarity,
             count(*) as matchCount,
             collect(e.id)[0..5] as sampleIds
        WHERE matchCount >= 3
        RETURN userId, workspaceId, project, week, avgSimilarity, matchCount, sampleIds
        ORDER BY matchCount DESC
        LIMIT 20
      `, {
        seedId: seedId
      })
      
      const elapsed = Date.now() - startTime
      await logger.debug(`Similarity calculation took ${elapsed}ms`, {
        functionName: 'detectDebuggingPatterns',
        executionTime: elapsed
      })
    
      await logger.info(`Found ${similarResult.records.length} pattern groups for seed ${seedId}`, {
        functionName: 'detectDebuggingPatterns',
        groupCount: similarResult.records.length,
        seedId
      })
      
      // Process the aggregated results directly
      for (const record of similarResult.records) {
        const userId = getValue(record, 'userId')
        const workspaceId = getValue(record, 'workspaceId')
        const project = getValue(record, 'project')
        const week = getValue(record, 'week')
        const avgSimilarity = getValue(record, 'avgSimilarity')
        const matchCount = toNumber(getValue(record, 'matchCount'))
        const sampleIds = getValue(record, 'sampleIds')
        
        if (!project || matchCount < 3) continue
        
        const pattern = {
          type: 'debugging',
          pattern: 'debugging-session-semantic',
          userId: userId,
          workspaceId: workspaceId,
          project: project,
          week: week,
          confidence: Math.min(avgSimilarity * (matchCount / 10), 0.95),
          frequency: matchCount,
          metadata: {
            avgSimilarity: avgSimilarity,
            detectionMethod: 'semantic',
            temporalGrouping: 'weekly',
            sampleEntityIds: sampleIds || [],
            seedId: seedId
          }
        }
        
        await logger.debug(`Creating semantic pattern for ${project} in week ${week} with ${matchCount} entities`, {
          functionName: 'detectDebuggingPatterns',
          project: project,
          week: week,
          entityCount: matchCount
        })
        patterns.push(pattern)
      }
      
      await logger.info(`Created ${similarResult.records.length} semantic patterns from seed ${seedId}`, {
        functionName: 'detectDebuggingPatterns',
        patternCount: similarResult.records.length,
        seedId
      })
    } catch (error) {
      await logger.error(`Error processing seed ${seedId}:`, error, {
        functionName: 'detectDebuggingPatterns',
        seedId,
        errorMessage: error.message,
        errorStack: error.stack
      })
      continue
    }
  }
  
  // Also run keyword detection and merge results
  const keywordPatterns = await detectDebuggingPatternsKeywordOnly(session, logger, workspaceId, userId)
  
  await logger.info(`Found ${patterns.length} semantic patterns and ${keywordPatterns.length} keyword patterns`, {
    functionName: 'detectDebuggingPatterns',
    semanticPatternCount: patterns.length,
    keywordPatternCount: keywordPatterns.length
  })
  
  // Merge patterns, preferring semantic when there's overlap
  const mergedPatterns = new Map()
  
  for (const pattern of [...patterns, ...keywordPatterns]) {
    const period = pattern.day || pattern.week || 'unknown'
    const key = `${pattern.userId}|${pattern.project}|${period}`
    
    if (!mergedPatterns.has(key) || pattern.metadata?.detectionMethod === 'semantic') {
      mergedPatterns.set(key, pattern)
    } else {
      // Merge frequencies
      const existing = mergedPatterns.get(key)
      existing.frequency = Math.max(existing.frequency, pattern.frequency)
      existing.confidence = Math.max(existing.confidence, pattern.confidence)
    }
  }
  
  const finalPatterns = Array.from(mergedPatterns.values())
  await logger.info(`Returning ${finalPatterns.length} merged patterns`, {
    functionName: 'detectDebuggingPatterns',
    finalPatternCount: finalPatterns.length
  })
  return finalPatterns
}

async function detectDebuggingPatternsKeywordOnly(session: any, logger: any, workspaceId?: string, userId?: string) {
  const patterns = []
  const tenantFilter = getTenantFilter(workspaceId, userId)
  
  const result = await session.run(`
    MATCH (e:EntitySummary)
    WHERE e.pattern_signals CONTAINS '"is_debugging":true'
      ${tenantFilter !== 'TRUE' ? `AND ${tenantFilter}` : ''}
    WITH e.user_id as userId,
         e.workspace_id as workspaceId,
         e.project_name as project,
         toString(date(e.created_at)) as day,
         count(e) as debugCount
    WHERE debugCount > 3
    RETURN userId, workspaceId, project, day, debugCount
    ORDER BY debugCount DESC
    LIMIT 50
  `)
  
  for (const record of result.records) {
    const count = toNumber(getValue(record, 'debugCount'))
    if (count > 5) {
      patterns.push({
        type: 'debugging',
        pattern: 'debugging-session',
        userId: getValue(record, 'userId'),
        workspaceId: getValue(record, 'workspaceId'),
        project: getValue(record, 'project'),
        day: getValue(record, 'day'),
        confidence: Math.min(count / 20, 0.95),
        frequency: count,
        metadata: {
          detectionMethod: 'keyword'
        }
      })
    }
  }
  
  return patterns
}

async function detectLearningPatterns(session: any, workspaceId?: string, userId?: string) {
  await logger.info('Starting learning pattern detection...', { functionName: 'detectLearningPatterns' })
  const patterns = []
  const tenantFilter = getTenantFilter(workspaceId, userId)
  
  // Starting learning pattern detection is already logged
  
  // Get learning seeds with embeddings
  const learningSeeds = await session.run(`
    MATCH (e:EntitySummary)
    WHERE e.pattern_signals CONTAINS '"is_learning":true'
      AND e.embedding IS NOT NULL
      ${tenantFilter !== 'TRUE' ? `AND ${tenantFilter}` : ''}
    RETURN e.id as id
    ORDER BY e.created_at DESC
    LIMIT 5
  `)
  
  await logger.info(`Found ${learningSeeds.records.length} learning seeds for semantic search`, {
    functionName: 'detectLearningPatterns',
    seedCount: learningSeeds.records.length
  })
  
  if (learningSeeds.records.length === 0) {
    // Fall back to keyword-only detection
    return await detectLearningPatternsKeywordOnly(session, logger, workspaceId, userId)
  }
  
  // Process each seed
  for (const seedRecord of learningSeeds.records) {
    const seedId = getValue(seedRecord, 'id')
    if (!seedId) continue
    
    await logger.debug(`Finding similar learning entities for seed ${seedId}...`, {
      functionName: 'detectLearningPatterns',
      seedId
    })
    
    // Use optimized semantic search with aggregation
    const similarResult = await session.run(`
      MATCH (seed:EntitySummary {id: $seedId})
      WHERE seed.embedding IS NOT NULL
      WITH seed, seed.embedding AS seedEmbedding
      MATCH (e:EntitySummary)
      WHERE e.id <> seed.id
        AND e.embedding IS NOT NULL
        AND e.created_at > datetime() - duration('P30D')
        AND vector.similarity.cosine(seedEmbedding, e.embedding) > 0.7
        ${tenantFilter !== 'TRUE' ? `AND ${tenantFilter}` : ''}
      WITH e.user_id as userId,
           e.workspace_id as workspaceId,
           e.project_name as project,
           toString(date(e.created_at).week) as week,
           avg(vector.similarity.cosine(seedEmbedding, e.embedding)) as avgSimilarity,
           count(*) as matchCount,
           collect(e.id)[0..5] as sampleIds
      WHERE matchCount >= 3
      RETURN userId, workspaceId, project, week, avgSimilarity, matchCount, sampleIds
      ORDER BY matchCount DESC
      LIMIT 20
    `, { seedId })
    
    await logger.info(`Found ${similarResult.records.length} pattern groups`, {
      functionName: 'detectLearningPatterns',
      groupCount: similarResult.records.length,
      seedId
    })
    
    // Process aggregated results directly
    for (const record of similarResult.records) {
      const userId = getValue(record, 'userId')
      const workspaceId = getValue(record, 'workspaceId')
      const project = getValue(record, 'project')
      const week = getValue(record, 'week')
      const avgSimilarity = getValue(record, 'avgSimilarity')
      const matchCount = toNumber(getValue(record, 'matchCount'))
      const sampleIds = getValue(record, 'sampleIds')
      
      if (!project || matchCount < 3) continue
      
      const pattern = {
        type: 'learning',
        pattern: 'research-session-semantic',
        userId: userId,
        workspaceId: workspaceId,
        project: project,
        week: week,
        confidence: Math.min(avgSimilarity * (matchCount / 15), 0.9),
        frequency: matchCount,
        metadata: {
          avgSimilarity: avgSimilarity,
          detectionMethod: 'semantic-vector-search',
          temporalGrouping: 'weekly',
          sampleEntityIds: sampleIds || [],
          seedId: seedId
        }
      }
      
      await logger.debug(`Creating semantic learning pattern for ${project} with ${matchCount} entities`, {
        functionName: 'detectLearningPatterns',
        project: project,
        entityCount: matchCount
      })
      patterns.push(pattern)
    }
  }
  
  // Also run keyword detection and merge
  const keywordPatterns = await detectLearningPatternsKeywordOnly(session, logger, workspaceId, userId)
  
  // Merge patterns
  const mergedPatterns = new Map()
  for (const pattern of [...patterns, ...keywordPatterns]) {
    const period = pattern.day || pattern.week || 'unknown'
    const key = `${pattern.userId}|${pattern.project}|${period}`
    
    if (!mergedPatterns.has(key) || pattern.metadata?.detectionMethod?.includes('semantic')) {
      mergedPatterns.set(key, pattern)
    }
  }
  
  return Array.from(mergedPatterns.values())
}

async function detectLearningPatternsKeywordOnly(session: any, logger: any, workspaceId?: string, userId?: string) {
  const patterns = []
  const tenantFilter = getTenantFilter(workspaceId, userId)
  
  const result = await session.run(`
    MATCH (e:EntitySummary)
    WHERE e.pattern_signals CONTAINS '"is_learning":true'
      ${tenantFilter !== 'TRUE' ? `AND ${tenantFilter}` : ''}
    WITH e.user_id as userId,
         e.workspace_id as workspaceId,
         e.project_name as project,
         toString(date(e.created_at)) as day,
         count(e) as learnCount
    WHERE learnCount > 3
    RETURN userId, workspaceId, project, day, learnCount
    ORDER BY learnCount DESC
    LIMIT 50
  `)
  
  for (const record of result.records) {
    const count = toNumber(getValue(record, 'learnCount'))
    if (count > 3) {
      patterns.push({
        type: 'learning',
        pattern: 'research-session',
        userId: getValue(record, 'userId'),
        workspaceId: getValue(record, 'workspaceId'),
        project: getValue(record, 'project'),
        day: getValue(record, 'day'),
        confidence: Math.min(count / 15, 0.9),
        frequency: count,
        metadata: {
          detectionMethod: 'keyword'
        }
      })
    }
  }
  
  return patterns
}

async function detectRefactoringPatterns(session: any, workspaceId?: string, userId?: string) {
  await logger.info('Starting refactoring pattern detection...', { functionName: 'detectRefactoringPatterns' })
  const patterns = []
  const tenantFilter = getTenantFilter(workspaceId, userId)
  
  // Starting refactoring pattern detection is already logged
  
  // Get refactoring seeds with embeddings
  const refactoringSeeds = await session.run(`
    MATCH (e:EntitySummary)
    WHERE e.pattern_signals CONTAINS '"is_refactoring":true'
      AND e.embedding IS NOT NULL
      ${tenantFilter !== 'TRUE' ? `AND ${tenantFilter}` : ''}
    RETURN e.id as id
    ORDER BY e.created_at DESC
    LIMIT 5
  `)
  
  await logger.info(`Found ${refactoringSeeds.records.length} refactoring seeds for semantic search`, {
    functionName: 'detectRefactoringPatterns',
    seedCount: refactoringSeeds.records.length
  })
  
  if (refactoringSeeds.records.length === 0) {
    return await detectRefactoringPatternsKeywordOnly(session, logger, workspaceId, userId)
  }
  
  // Process each seed
  for (const seedRecord of refactoringSeeds.records) {
    const seedId = getValue(seedRecord, 'id')
    if (!seedId) continue
    
    // Use vector.similarity.cosine for semantic search
    const similarResult = await session.run(`
      MATCH (seed:EntitySummary {id: $seedId})
      MATCH (e:EntitySummary)
      WHERE e.id <> seed.id
        AND e.embedding IS NOT NULL
        AND seed.embedding IS NOT NULL
        AND vector.similarity.cosine(seed.embedding, e.embedding) > 0.65
        ${tenantFilter !== 'TRUE' ? `AND ${tenantFilter}` : ''}
      WITH e, 
           vector.similarity.cosine(seed.embedding, e.embedding) as similarity,
           toString(date(e.created_at)) as day
      RETURN e, similarity, day
      ORDER BY similarity DESC
      LIMIT 100
    `, { seedId })
    
    // Group by project and week
    const groupedResults = new Map<string, any>()
    
    for (const record of similarResult.records) {
      const entity = getValue(record, 'e')?.properties
      const similarity = getValue(record, 'similarity')
      const day = getValue(record, 'day')
      
      if (!entity) continue
      
      const weekStart = day ? day.substring(0, 8) + '01' : 'unknown'
      const key = `${entity.user_id || 'unknown'}|${entity.project_name || 'unknown'}|week-${weekStart}`
      
      if (!groupedResults.has(key)) {
        groupedResults.set(key, {
          userId: entity.user_id,
          workspaceId: entity.workspace_id,
          project: entity.project_name,
          week: weekStart,
          count: 0,
          totalSimilarity: 0,
          entities: []
        })
      }
      
      const group = groupedResults.get(key)!
      group.count++
      group.totalSimilarity += similarity
      group.entities.push(entity.id)
    }
    
    // Create patterns from groups
    for (const [key, group] of groupedResults) {
      if (group.count >= 2) { // Lower threshold for refactoring
        const avgSimilarity = group.totalSimilarity / group.count
        const pattern = {
          type: 'refactoring',
          pattern: 'code-improvement-semantic',
          userId: group.userId,
          workspaceId: group.workspaceId,
          project: group.project,
          week: group.week,
          confidence: Math.min(avgSimilarity * (group.count / 10), 0.85),
          frequency: group.count,
          metadata: {
            avgSimilarity: avgSimilarity,
            detectionMethod: 'semantic-vector-search',
            temporalGrouping: 'weekly',
            sampleEntityIds: group.entities.slice(0, 5)
          }
        }
        
        await logger.debug(`Creating semantic refactoring pattern for ${group.project} with ${group.count} entities`, {
          functionName: 'detectRefactoringPatterns',
          project: group.project,
          entityCount: group.count
        })
        patterns.push(pattern)
      }
    }
  }
  
  // Also run keyword detection and merge
  const keywordPatterns = await detectRefactoringPatternsKeywordOnly(session, logger, workspaceId, userId)
  
  // Merge patterns
  const mergedPatterns = new Map()
  for (const pattern of [...patterns, ...keywordPatterns]) {
    const period = pattern.day || pattern.week || 'unknown'
    const key = `${pattern.userId}|${pattern.project}|${period}`
    
    if (!mergedPatterns.has(key) || pattern.metadata?.detectionMethod?.includes('semantic')) {
      mergedPatterns.set(key, pattern)
    }
  }
  
  return Array.from(mergedPatterns.values())
}

async function detectRefactoringPatternsKeywordOnly(session: any, logger: any, workspaceId?: string, userId?: string) {
  const patterns = []
  const tenantFilter = getTenantFilter(workspaceId, userId)
  
  const result = await session.run(`
    MATCH (e:EntitySummary)
    WHERE e.pattern_signals CONTAINS '"is_refactoring":true'
      ${tenantFilter !== 'TRUE' ? `AND ${tenantFilter}` : ''}
    WITH e.user_id as userId,
         e.workspace_id as workspaceId,
         e.project_name as project,
         toString(date(e.created_at)) as week,
         count(e) as refactorCount
    WHERE refactorCount > 2
    RETURN userId, workspaceId, project, week, refactorCount
    ORDER BY refactorCount DESC
    LIMIT 30
  `)
  
  for (const record of result.records) {
    const count = toNumber(getValue(record, 'refactorCount'))
    patterns.push({
      type: 'refactoring',
      pattern: 'code-improvement',
      userId: getValue(record, 'userId'),
      workspaceId: getValue(record, 'workspaceId'),
      project: getValue(record, 'project'),
      week: getValue(record, 'week'),
      confidence: Math.min(count / 10, 0.85),
      frequency: count,
      metadata: {
        detectionMethod: 'keyword'
      }
    })
  }
  
  return patterns
}

async function detectProblemSolvingPatterns(session: any, workspaceId?: string, userId?: string) {
  await logger.info('Starting problem-solving pattern detection...', { functionName: 'detectProblemSolvingPatterns' })
  const patterns = []
  const tenantFilter = getTenantFilter(workspaceId, userId)
  
  // Starting problem-solving pattern detection is already logged
  
  // Get problem-solving seeds with embeddings
  const problemSeeds = await session.run(`
    MATCH (e:EntitySummary)
    WHERE e.pattern_signals CONTAINS '"is_problem_solving":true'
      AND e.embedding IS NOT NULL
      ${tenantFilter !== 'TRUE' ? `AND ${tenantFilter}` : ''}
    RETURN e.id as id
    ORDER BY e.created_at DESC
    LIMIT 5
  `)
  
  if (problemSeeds.records.length === 0) {
    return await detectProblemSolvingPatternsKeywordOnly(session, logger, workspaceId, userId)
  }
  
  // Process each seed
  for (const seedRecord of problemSeeds.records) {
    const seedId = getValue(seedRecord, 'id')
    if (!seedId) continue
    
    // Use vector.similarity.cosine for semantic search
    const similarResult = await session.run(`
      MATCH (seed:EntitySummary {id: $seedId})
      MATCH (e:EntitySummary)
      WHERE e.id <> seed.id
        AND e.embedding IS NOT NULL
        AND vector.similarity.cosine(seed.embedding, e.embedding) > 0.65
        ${tenantFilter !== 'TRUE' ? `AND ${tenantFilter}` : ''}
      WITH e, 
           vector.similarity.cosine(seed.embedding, e.embedding) as similarity,
           toString(date(e.created_at)) as day
      RETURN e, similarity, day
      ORDER BY similarity DESC
      LIMIT 100
    `, { seedId })
    
    // Group by project and day (problem solving is often more immediate)
    const groupedResults = new Map<string, any>()
    
    for (const record of similarResult.records) {
      const entity = getValue(record, 'e')?.properties
      const similarity = getValue(record, 'similarity')
      const day = getValue(record, 'day')
      
      if (!entity) continue
      
      const key = `${entity.user_id || 'unknown'}|${entity.project_name || 'unknown'}|${day || 'unknown'}`
      
      if (!groupedResults.has(key)) {
        groupedResults.set(key, {
          userId: entity.user_id,
          workspaceId: entity.workspace_id,
          project: entity.project_name,
          day: day,
          count: 0,
          totalSimilarity: 0,
          entities: []
        })
      }
      
      const group = groupedResults.get(key)!
      group.count++
      group.totalSimilarity += similarity
      group.entities.push(entity.id)
    }
    
    // Create patterns from groups
    for (const [key, group] of groupedResults) {
      if (group.count >= 2) {
        const avgSimilarity = group.totalSimilarity / group.count
        const pattern = {
          type: 'problem_solving',
          pattern: 'investigation-semantic',
          userId: group.userId,
          workspaceId: group.workspaceId,
          project: group.project,
          day: group.day,
          confidence: Math.min(avgSimilarity * (group.count / 8), 0.85),
          frequency: group.count,
          metadata: {
            avgSimilarity: avgSimilarity,
            detectionMethod: 'semantic-vector-search',
            temporalGrouping: 'daily',
            sampleEntityIds: group.entities.slice(0, 5)
          }
        }
        
        await logger.debug(`Creating semantic problem-solving pattern for ${group.project} with ${group.count} entities`, {
          functionName: 'detectProblemSolvingPatterns',
          project: group.project,
          entityCount: group.count
        })
        patterns.push(pattern)
      }
    }
  }
  
  // Also run keyword detection and merge
  const keywordPatterns = await detectProblemSolvingPatternsKeywordOnly(session, logger, workspaceId, userId)
  
  // Merge patterns
  const mergedPatterns = new Map()
  for (const pattern of [...patterns, ...keywordPatterns]) {
    const key = `${pattern.userId}|${pattern.project}|${pattern.day}`
    
    if (!mergedPatterns.has(key) || pattern.metadata?.detectionMethod?.includes('semantic')) {
      mergedPatterns.set(key, pattern)
    }
  }
  
  return Array.from(mergedPatterns.values())
}

async function detectProblemSolvingPatternsKeywordOnly(session: any, logger: any, workspaceId?: string, userId?: string) {
  const patterns = []
  const tenantFilter = getTenantFilter(workspaceId, userId)
  
  const result = await session.run(`
    MATCH (e:EntitySummary)
    WHERE e.pattern_signals CONTAINS '"is_problem_solving":true'
      ${tenantFilter !== 'TRUE' ? `AND ${tenantFilter}` : ''}
    WITH e.user_id as userId,
         e.workspace_id as workspaceId,
         e.project_name as project,
         toString(date(e.created_at)) as day,
         count(e) as solveCount
    WHERE solveCount > 2
    RETURN userId, workspaceId, project, day, solveCount
    ORDER BY solveCount DESC
    LIMIT 30
  `)
  
  for (const record of result.records) {
    const count = toNumber(getValue(record, 'solveCount'))
    patterns.push({
      type: 'problem_solving',
      pattern: 'investigation',
      userId: getValue(record, 'userId'),
      workspaceId: getValue(record, 'workspaceId'),
      project: getValue(record, 'project'),
      day: getValue(record, 'day'),
      confidence: Math.min(count / 8, 0.85),
      frequency: count,
      metadata: {
        detectionMethod: 'keyword'
      }
    })
  }
  
  return patterns
}

// New pattern detectors

async function detectTemporalSessionPatterns(session: any, workspaceId?: string, userId?: string) {
  await logger.info('Starting temporal session pattern detection...', { functionName: 'detectTemporalSessionPatterns' })
  const patterns = []
  const tenantFilter = getTenantFilter(workspaceId, userId)
  
  // Starting temporal session pattern detection is already logged
  
  // Find dense activity sessions (many activities in short time)
  const sessionResult = await session.run(`
    MATCH (e:EntitySummary)
    WHERE e.created_at > datetime() - duration('P30D')
      ${tenantFilter !== 'TRUE' ? `AND ${tenantFilter}` : ''}
    WITH e.user_id as userId,
         e.workspace_id as workspaceId,
         e.project_name as project,
         toString(date(e.created_at)) as day,
         toString(datetime({epochMillis: toInteger(e.created_at.epochMillis / 3600000) * 3600000})) as hour,
         count(e) as activityCount,
         collect(e.id) as entityIds
    WHERE activityCount >= 5
    RETURN userId, workspaceId, project, day, hour, activityCount, entityIds[0..10] as sampleIds
    ORDER BY activityCount DESC
    LIMIT 50
  `)
  
  for (const record of sessionResult.records) {
    const count = toNumber(getValue(record, 'activityCount'))
    const hour = getValue(record, 'hour')
    
    patterns.push({
      type: 'temporal',
      pattern: 'intensive-session',
      userId: getValue(record, 'userId'),
      workspaceId: getValue(record, 'workspaceId'),
      project: getValue(record, 'project'),
      day: getValue(record, 'day'),
      hour: hour,
      confidence: Math.min(count / 20, 0.9),
      frequency: count,
      metadata: {
        detectionMethod: 'temporal-density',
        temporalGranularity: 'hourly',
        sampleEntityIds: getValue(record, 'sampleIds')
      }
    })
  }
  
  return patterns
}

async function detectSemanticClusters(session: any, workspaceId?: string, userId?: string) {
  await logger.info('Starting semantic cluster detection...', { functionName: 'detectSemanticClusters' })
  const patterns = []
  const tenantFilter = getTenantFilter(workspaceId, userId)
  
  // Starting semantic clustering detection is already logged
  
  // Find highly connected semantic clusters
  // For each project, find groups of entities with high mutual similarity
  const projectsResult = await session.run(`
    MATCH (e:EntitySummary)
    WHERE e.embedding IS NOT NULL
      ${tenantFilter !== 'TRUE' ? `AND ${tenantFilter}` : ''}
    RETURN DISTINCT e.project_name as project, e.user_id as userId, e.workspace_id as workspaceId
    LIMIT 10
  `)
  
  for (const projectRecord of projectsResult.records) {
    const project = getValue(projectRecord, 'project')
    const userId = getValue(projectRecord, 'userId')
    const workspaceId = getValue(projectRecord, 'workspaceId')
    
    if (!project) continue
    
    // Get a sample of entities from this project
    const samplesResult = await session.run(`
      MATCH (e:EntitySummary)
      WHERE e.project_name = $project
        AND e.embedding IS NOT NULL
        ${tenantFilter !== 'TRUE' ? `AND ${tenantFilter}` : ''}
      RETURN e.id as id
      ORDER BY e.created_at DESC
      LIMIT 20
    `, { project })
    
    if (samplesResult.records.length < 5) continue
    
    // For each sample, find its cluster
    const sampleId = getValue(samplesResult.records[0], 'id')
    
    const clusterResult = await session.run(`
      MATCH (seed:EntitySummary {id: $sampleId})
      WHERE seed.embedding IS NOT NULL
      WITH seed, seed.embedding AS seedEmbedding
      MATCH (e:EntitySummary)
      WHERE e.project_name = $project
        AND e.id <> seed.id
        AND e.embedding IS NOT NULL
        AND e.created_at > datetime() - duration('P30D')
        AND vector.similarity.cosine(seedEmbedding, e.embedding) > 0.8
        ${tenantFilter !== 'TRUE' ? `AND ${tenantFilter}` : ''}
      WITH collect(e.id)[0..10] as clusterIds,
           avg(vector.similarity.cosine(seedEmbedding, e.embedding)) as avgSimilarity,
           count(e) as clusterSize
      WHERE clusterSize >= 5
      RETURN clusterIds, avgSimilarity, clusterSize
    `, { sampleId, project })
    
    if (clusterResult.records.length > 0) {
      const clusterSize = toNumber(getValue(clusterResult.records[0], 'clusterSize'))
      const avgSimilarity = getValue(clusterResult.records[0], 'avgSimilarity')
      const clusterIds = getValue(clusterResult.records[0], 'clusterIds')
      
      patterns.push({
        type: 'semantic_cluster',
        pattern: 'topic-cluster',
        userId: userId,
        workspaceId: workspaceId,
        project: project,
        confidence: Math.min(avgSimilarity * (clusterSize / 15), 0.9),
        frequency: clusterSize,
        metadata: {
          avgSimilarity: avgSimilarity,
          detectionMethod: 'semantic-clustering',
          clusterCentroid: sampleId,
          sampleEntityIds: clusterIds?.slice(0, 5) || []
        }
      })
      
      await logger.info(`Found semantic cluster in ${project} with ${clusterSize} entities`, {
        functionName: 'detectSemanticClusters',
        project,
        clusterSize
      })
    }
  }
  
  return patterns
}

async function detectMemoryCodeRelationships(session: any, workspaceId?: string, userId?: string) {
  await logger.info('Starting memory-code relationship detection...', { 
    functionName: 'detectMemoryCodeRelationships',
    workspaceId,
    userId 
  })
  const patterns = []
  let relationshipsCreated = 0
  
  // Build tenant filter
  const tenantFilter = getTenantFilter(workspaceId, userId, 'm')
  const tenantFilterCode = getTenantFilter(workspaceId, userId, 'c')
  
  // First, get counts to understand the data
  const countResult = await session.run(`
    MATCH (m:EntitySummary {entity_type: 'memory'})
    WHERE m.embedding IS NOT NULL AND ${tenantFilter}
    WITH COUNT(m) as memoryCount
    MATCH (c:EntitySummary {entity_type: 'code'})
    WHERE c.embedding IS NOT NULL AND ${tenantFilterCode}
    WITH memoryCount, COUNT(c) as codeCount
    RETURN memoryCount, codeCount
  `)
  
  const counts = countResult.records[0]
  const memoryCount = toNumber(getValue(counts, 'memoryCount'))
  const codeCount = toNumber(getValue(counts, 'codeCount'))
  
  await logger.info(`Found ${memoryCount} memories and ${codeCount} code entities for relationship detection`, {
    functionName: 'detectMemoryCodeRelationships',
    memoryCount,
    codeCount
  })
  
  if (memoryCount === 0 || codeCount === 0) {
    await logger.info('No memories or code found for relationship detection', {
      functionName: 'detectMemoryCodeRelationships',
      workspaceId,
      userId
    })
    return patterns
  }
  
  // Process in smaller batches to avoid timeouts
  const BATCH_SIZE = 10
  let offset = 0
  
  while (offset < Math.min(memoryCount, 50)) { // Process up to 50 memories
    // Get a batch of memories
    const memoryBatch = await session.run(`
      MATCH (m:EntitySummary {entity_type: 'memory'})
      WHERE m.embedding IS NOT NULL AND ${tenantFilter}
      RETURN m
      ORDER BY m.created_at DESC
      SKIP $offset
      LIMIT $batchSize
    `, { offset: neo4j.int(offset), batchSize: neo4j.int(BATCH_SIZE) })
    
    if (memoryBatch.records.length === 0) break
    
    await logger.info(`Processing batch ${offset/BATCH_SIZE + 1} with ${memoryBatch.records.length} memories`, {
      functionName: 'detectMemoryCodeRelationships',
      batch: offset/BATCH_SIZE + 1,
      size: memoryBatch.records.length
    })
    
    // Process each memory
    for (const memRecord of memoryBatch.records) {
      const memorySummary = getValue(memRecord, 'm')?.properties
      if (!memorySummary) continue
      
      const memoryId = memorySummary.entity_id
      const projectName = memorySummary.project_name
      
      if (!projectName) continue
      
      try {
        // Find similar code entities using a more efficient query
        const semanticResult = await session.run(`
          MATCH (m:EntitySummary {entity_id: $memoryId, entity_type: 'memory'})
          MATCH (c:EntitySummary {entity_type: 'code'})
          WHERE c.embedding IS NOT NULL
            AND c.project_name = $projectName
            AND vector.similarity.cosine(m.embedding, c.embedding) >= $minSimilarity
          WITH m, c, vector.similarity.cosine(m.embedding, c.embedding) as similarity
          ORDER BY similarity DESC
          LIMIT 5
          
          // Get the actual Memory and CodeEntity nodes
          MATCH (memory:Memory {id: m.entity_id})
          MATCH (code:CodeEntity {id: c.entity_id})
          
          // Check if relationship already exists and limits
          WHERE NOT EXISTS((memory)-[:REFERENCES_CODE]-(code))
            AND SIZE([(memory)-[:REFERENCES_CODE|DISCUSSES]->() | 1]) < $maxPerEntity
            AND SIZE([(code)<-[:REFERENCES_CODE|DISCUSSED_IN]-() | 1]) < $maxPerEntity
          
          // Create bidirectional relationships
          CREATE (memory)-[r1:REFERENCES_CODE]->(code)
          SET r1.similarity = similarity,
              r1.detected_at = datetime(),
              r1.detection_method = 'semantic_similarity'
          
          CREATE (code)-[r2:DISCUSSED_IN]->(memory)
          SET r2.similarity = similarity,
              r2.detected_at = datetime(),
              r2.detection_method = 'semantic_similarity'
          
          RETURN count(DISTINCT memory) as created
        `, {
          memoryId: memoryId,
          projectName: projectName,
          minSimilarity: MIN_SIMILARITY_THRESHOLD,
          maxPerEntity: neo4j.int(MAX_RELATIONSHIPS_PER_ENTITY)
        })
        
        const created = toNumber(getValue(semanticResult.records[0], 'created'))
        if (created > 0) {
          relationshipsCreated += created
          await logger.debug(`Created ${created} relationships for memory ${memoryId}`, {
            functionName: 'detectMemoryCodeRelationships',
            memoryId,
            created
          })
        }
      } catch (error) {
        await logger.warn(`Failed to process memory ${memoryId}`, { 
          error: error.message,
          functionName: 'detectMemoryCodeRelationships',
          memoryId
        })
      }
    }
    
    offset += BATCH_SIZE
  }
  
  await logger.info(`Created ${relationshipsCreated} semantic memory-code relationships`, {
    functionName: 'detectMemoryCodeRelationships',
    relationshipCount: relationshipsCreated
  })
  
  // Now get aggregated patterns for reporting
  const result = await session.run(`
    MATCH (m:EntitySummary {entity_type: 'memory'})
    MATCH (c:EntitySummary {entity_type: 'code'})
    WHERE m.embedding IS NOT NULL
      AND c.embedding IS NOT NULL
      AND m.project_name = c.project_name
      AND vector.similarity.cosine(m.embedding, c.embedding) > $minSimilarity
      // Same tenant isolation check
      AND (
        (m.workspace_id IS NOT NULL AND m.workspace_id = c.workspace_id) OR
        (m.user_id IS NOT NULL AND m.user_id = c.user_id)
      )
    WITH m.user_id as userId,
         m.workspace_id as workspaceId,
         m.project_name as project,
         m.entity_id as memoryId,
         c.entity_id as codeId,
         vector.similarity.cosine(m.embedding, c.embedding) as similarity
    WITH userId, workspaceId, project,
         count(*) as relationshipCount,
         avg(similarity) as avgSimilarity,
         collect({memory: memoryId, code: codeId, similarity: similarity})[0..5] as samples
    WHERE relationshipCount >= 3
    RETURN userId, workspaceId, project, relationshipCount, avgSimilarity, samples
  `, { minSimilarity: MIN_SIMILARITY_THRESHOLD })
  
  for (const record of result.records) {
    const count = toNumber(getValue(record, 'relationshipCount'))
    const avgSim = getValue(record, 'avgSimilarity')
    
    patterns.push({
      type: 'memory_code_relationship',
      pattern: 'documentation-implementation',
      userId: getValue(record, 'userId'),
      workspaceId: getValue(record, 'workspaceId'),
      project: getValue(record, 'project'),
      confidence: Math.min(avgSim * (count / 10), 0.9),
      frequency: count,
      metadata: {
        avgSimilarity: avgSim,
        detectionMethod: 'cross-entity-semantic',
        samples: getValue(record, 'samples')
      }
    })
    
    await logger.info(`Found memory-code relationships in ${getValue(record, 'project')} with ${count} connections`, {
      functionName: 'detectMemoryCodeRelationships',
      project: getValue(record, 'project'),
      connectionCount: count
    })
    
    relationshipsCreated += count
  }
  
  // Additional relationship detection based on specific mentions
  // Find memories that mention function/class names from code
  // Handle both cases: functions as a property directly or within metadata
  const keywordResult = await session.run(`
    MATCH (c:CodeEntity)
    WHERE c.functions IS NOT NULL OR c.metadata IS NOT NULL
    WITH c
    // Handle functions as direct property (list)
    OPTIONAL MATCH (c) WHERE c.functions IS NOT NULL
    WITH c, [f IN c.functions | f.name] as directFunctionNames
    // For now, just use the direct function names if available
    WITH c, coalesce(directFunctionNames, []) as functionNames
    UNWIND functionNames as name
    WITH c, name
    WHERE name IS NOT NULL AND size(name) > 3
    MATCH (m:Memory)
    WHERE m.content CONTAINS name
      AND m.project_name = c.project_name
      AND ${getTenantFilter(workspaceId, userId, 'm')}
      AND ${getTenantFilter(workspaceId, userId, 'c')}
      AND NOT EXISTS((m)-[:REFERENCES_CODE]-(c))
      AND SIZE([(m)-[:REFERENCES_CODE|DISCUSSES]->() | 1]) < $maxPerEntity
      AND SIZE([(c)<-[:REFERENCES_CODE|DISCUSSED_IN]-() | 1]) < $maxPerEntity
    CREATE (m)-[r1:REFERENCES_CODE]->(c)
    SET r1.detected_at = datetime(),
        r1.detection_method = 'keyword_match',
        r1.matched_name = name
    CREATE (c)-[r2:DISCUSSED_IN]->(m)
    SET r2.detected_at = datetime(),
        r2.detection_method = 'keyword_match',
        r.matched_name = name
    RETURN count(r) as created
  `, { maxPerEntity: neo4j.int(MAX_RELATIONSHIPS_PER_ENTITY) })
  
  // Handle the first keyword result
  try {
    const keywordRelationships1 = toNumber(getValue(keywordResult.records[0], 'created'))
    if (keywordRelationships1 > 0) {
      relationshipsCreated += keywordRelationships1
      await logger.info(`Created ${keywordRelationships1} memory-code relationships based on function name matching`, {
        functionName: 'detectMemoryCodeRelationships',
        relationshipCount: keywordRelationships1
      })
    }
  } catch (error) {
    await logger.warn('Function name matching query failed', { 
      error: error.message,
      functionName: 'detectMemoryCodeRelationships'
    })
  }
  
  // Since Neo4j Aura doesn't have APOC, let's use a simpler approach
  const keywordResult2 = await session.run(`
    MATCH (m:Memory)
    MATCH (c:CodeEntity)
    WHERE m.project_name = c.project_name
      AND m.content IS NOT NULL
      AND c.name IS NOT NULL
      AND size(c.name) > 3
      AND m.content CONTAINS c.name
      AND ${getTenantFilter(workspaceId, userId, 'm')}
      AND ${getTenantFilter(workspaceId, userId, 'c')}
      AND NOT EXISTS((m)-[:REFERENCES_CODE]-(c))
      AND SIZE([(m)-[:REFERENCES_CODE|DISCUSSES]->() | 1]) < $maxPerEntity
      AND SIZE([(c)<-[:REFERENCES_CODE|DISCUSSED_IN]-() | 1]) < $maxPerEntity
    CREATE (m)-[r1:REFERENCES_CODE]->(c)
    SET r1.detected_at = datetime(),
        r1.detection_method = 'name_match',
        r1.matched_name = c.name
    CREATE (c)-[r2:DISCUSSED_IN]->(m)
    SET r2.detected_at = datetime(),
        r2.detection_method = 'name_match',
        r.matched_name = c.name
    RETURN count(r) as created
  `, { maxPerEntity: neo4j.int(MAX_RELATIONSHIPS_PER_ENTITY) })
  
  const keywordRelationships = toNumber(getValue(keywordResult2.records[0], 'created'))
  if (keywordRelationships > 0) {
    relationshipsCreated += keywordRelationships
    await logger.info(`Created ${keywordRelationships} memory-code relationships based on name matching`, {
      functionName: 'detectMemoryCodeRelationships',
      relationshipCount: keywordRelationships
    })
  }
  
  await logger.info(`Total memory-code relationships created: ${relationshipsCreated}`, {
    functionName: 'detectMemoryCodeRelationships',
    totalRelationships: relationshipsCreated
  })
  
  return patterns
}

async function storePatternBatch(session: any, patterns: any[], batchId: string) {
  if (patterns.length === 0) return
  
  // Transform patterns to a format suitable for batch processing
  const patternData = patterns.map(pattern => ({
    patternId: `${pattern.type}-${pattern.pattern}-${batchId}-${Date.now()}-${Math.random()}`,
    type: pattern.type,
    pattern: pattern.pattern,
    confidence: pattern.confidence || 0.5,
    frequency: pattern.frequency || 1,
    scopeId: pattern.userId || pattern.workspaceId || 'global',
    scopeData: JSON.stringify({
      project: pattern.project,
      period: pattern.day || pattern.week || 'unknown'
    }),
    metadata: JSON.stringify(pattern.metadata || {}),
    userId: pattern.userId || null,
    workspaceId: pattern.workspaceId || null,
    project: pattern.project || null,
    sampleEntityIds: pattern.metadata?.sampleEntityIds || []
  }))
  
  try {
    // First create all pattern nodes
    await session.run(`
      UNWIND $patterns AS pattern
      MERGE (p:Pattern {
        pattern_type: pattern.type,
        pattern_name: pattern.pattern,
        scope_id: pattern.scopeId,
        scope_data: pattern.scopeData
      })
      ON CREATE SET
        p.id = pattern.patternId,
        p.type = pattern.type,
        p.name = pattern.pattern,
        p.confidence = pattern.confidence,
        p.frequency = pattern.frequency,
        p.first_detected = datetime(),
        p.last_validated = datetime(),
        p.last_updated = datetime(),
        p.batch_id = $batchId,
        p.metadata = pattern.metadata,
        p.user_id = pattern.userId,
        p.workspace_id = pattern.workspaceId,
        p.project = pattern.project
      ON MATCH SET
        p.frequency = p.frequency + pattern.frequency,
        p.confidence = CASE 
          WHEN pattern.confidence > p.confidence THEN pattern.confidence 
          ELSE p.confidence 
        END,
        p.last_validated = datetime(),
        p.last_updated = datetime()
    `, {
      patterns: patternData,
      batchId
    })
    
    // Then create relationships to source entities
    for (const pattern of patternData) {
      if (pattern.sampleEntityIds && pattern.sampleEntityIds.length > 0) {
        // Create FOUND_IN relationships to EntitySummary nodes
        try {
          await session.run(`
            MATCH (p:Pattern {id: $patternId})
            UNWIND $entityIds AS entityId
            MATCH (e:EntitySummary {id: entityId})
            MERGE (p)-[r:FOUND_IN]->(e)
            SET r.created_at = datetime()
          `, {
            patternId: pattern.patternId,
            entityIds: pattern.sampleEntityIds
          })
          
          // Also create DERIVED_FROM relationships to the actual Memory/CodeEntity nodes
          await session.run(`
            MATCH (p:Pattern {id: $patternId})
            UNWIND $entityIds AS summaryId
            MATCH (s:EntitySummary {id: summaryId})
            MATCH (s)-[:SUMMARIZES]->(entity)
            WHERE entity:Memory OR entity:CodeEntity
            MERGE (p)-[r:DERIVED_FROM]->(entity)
            SET r.created_at = datetime(),
                r.via_summary = summaryId
          `, {
            patternId: pattern.patternId,
            entityIds: pattern.sampleEntityIds
          })
          
          await logger.debug(`Created relationships for pattern ${pattern.patternId}`, {
            functionName: 'storePatternBatch',
            patternId: pattern.patternId,
            entityCount: pattern.sampleEntityIds.length
          })
        } catch (relError) {
          await logger.warn(`Failed to create relationships for pattern ${pattern.patternId}`, {
            functionName: 'storePatternBatch',
            patternId: pattern.patternId,
            error: relError.message
          })
        }
      }
    }
    
    await logger.info(`Stored batch of ${patterns.length} patterns with relationships`, {
      functionName: 'storePatternBatch',
      patternCount: patterns.length,
      batchId
    })
  } catch (error) {
    await logger.error(`Failed to store pattern batch`, error, {
      functionName: 'storePatternBatch',
      patternCount: patterns.length,
      batchId,
      error: error.message
    })
    throw error
  }
}

async function storePattern(session: any, pattern: any, batchId: string) {
  const patternId = `${pattern.type}-${pattern.pattern}-${batchId}-${Date.now()}`
  
  const scopeData = JSON.stringify({
    project: pattern.project,
    period: pattern.day || pattern.week || 'unknown'
  })
  
  await logger.debug(`Storing pattern: ${pattern.type}/${pattern.pattern}`, {
    functionName: 'storePattern',
    patternType: pattern.type,
    pattern: pattern.pattern,
    scopeId: pattern.userId || pattern.workspaceId || 'global',
    scopeData,
    frequency: pattern.frequency,
    batchId
  })
  
  try {
    await session.run(`
      MERGE (p:Pattern {
        pattern_type: $type,
        pattern_name: $pattern,
        scope_id: $scopeId,
        scope_data: $scopeData
      })
      ON CREATE SET
        p.id = $patternId,
        p.confidence = $confidence,
        p.frequency = $frequency,
        p.first_detected = datetime(),
        p.last_validated = datetime(),
        p.last_updated = datetime(),
        p.batch_id = $batchId,
        p.metadata = $metadata
      ON MATCH SET
        p.frequency = p.frequency + $frequency,
        p.confidence = CASE 
          WHEN $confidence > p.confidence THEN $confidence 
          ELSE p.confidence 
        END,
        p.last_validated = datetime(),
        p.last_updated = datetime(),
        p.metadata = $metadata
    `, {
      patternId,
      type: pattern.type,
      pattern: pattern.pattern,
      confidence: pattern.confidence,
      frequency: pattern.frequency,
      scopeId: pattern.userId || pattern.workspaceId || 'global',
      scopeData: scopeData,
      metadata: JSON.stringify(pattern.metadata || {}),
      batchId
    })
    
    await logger.debug('Pattern stored successfully', {
      functionName: 'storePattern',
      patternType: pattern.type
    })
  } catch (error) {
    await logger.error(`Failed to store pattern: ${error.message}`, error, {
      functionName: 'storePattern',
      patternType: pattern.type
    })
    throw error
  }
}

serve(async (req, connInfo) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const batchId = crypto.randomUUID()
  
  // Parse request body to get parameters
  let workspaceId: string | undefined
  let userId: string | undefined
  let patternTypes: string[] | undefined
  let limit: number | undefined
  
  try {
    const body = await req.json()
    workspaceId = body.workspace_id
    userId = body.user_id
    patternTypes = body.pattern_types
    limit = body.limit
  } catch (e) {
    // If no body or invalid JSON, continue without context
  }
  
  // Create a promise for the background task
  const backgroundPromise = runBackgroundTask(batchId, workspaceId, userId, patternTypes, limit)
  
  // Check if we have access to waitUntil via the context
  const context = (globalThis as any).context || connInfo
  if (context && typeof context.waitUntil === 'function') {
    context.waitUntil(backgroundPromise)
  } else {
    // Fallback: just let the promise run
    backgroundPromise.catch(error => {
      console.error('Background task error:', error)
    })
  }
  
  // Return immediately
  return new Response(
    JSON.stringify({
      message: 'Pattern processing started',
      batchId,
      timestamp: new Date().toISOString()
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})

// Background task that does the actual work
async function runBackgroundTask(batchId: string, workspaceId?: string, userId?: string, patternTypes?: string[], limit?: number) {
  const startTime = Date.now()
  
  // Initialize clients
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  
  // Initialize database logger
  const dbLogger = new DBLogger(supabase, batchId)
  setLogger(dbLogger)
  
  try {
    await logger.info('Starting pattern processor background task', { batchId })
    
    const driver = getNeo4jDriver()
    
    const results: any = {
      timestamp: new Date().toISOString(),
      batchId,
      processed: {},
      patterns: []
    }
    
    try {
      // First ensure EntitySummaries exist by calling the dedicated function
      await logger.info('Ensuring EntitySummaries exist...')
      const summaryResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/create-entity-summaries`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          workspace_id: workspaceId,
          user_id: userId,
          limit: 200
        })
      })
      
      if (summaryResponse.ok) {
        const summaryResult = await summaryResponse.json()
        await logger.info(`Created ${summaryResult.processed} EntitySummaries`, { 
          processed: summaryResult.processed 
        })
        results.processed.summaries = summaryResult.processed
      }
      
      // Now detect patterns - no more summary creation here
      // Update checkpoint
      if (results.processed.summaries > 0) {
        await updateCheckpoint(supabase, 'code_processing', {
          last_processed_at: new Date().toISOString(),
          processed_count: results.processed.summaries
        })
      }
      
      // Detect patterns if we processed anything or if we want to run pattern detection anyway
      await logger.info(`Running pattern detection...`, {
        workspaceId,
        userId,
        patternTypes,
        limit
      })
      const patterns = await detectPatterns(driver, batchId, logger, workspaceId, userId, patternTypes)
      results.patterns = patterns
      results.patternCount = patterns.length
      await logger.info(`Pattern detection completed. Found ${patterns.length} patterns`, {
        patternCount: patterns.length,
        workspaceId,
        userId,
        patternTypes
      })
      
    } finally {
      await driver.close()
    }
    
    results.processingTime = Date.now() - startTime
    await logger.info(`Batch ${batchId} completed`, {
      processingTime: results.processingTime,
      summariesProcessed: results.processed.summaries || 0,
      patternCount: results.patternCount
    })
    
  } catch (error) {
    await logger.error(`Pattern processor error (batch ${batchId})`, error)
  } finally {
    await logger.close()
  }
}