import { logger } from './safe-logger.ts'

// Helper functions
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

// Create ownership filter for pattern queries
function getPatternOwnershipFilter(userId: string | null, teamId: string | null, nodeAlias: string = 'e'): string {
  if (teamId) {
    // Team workspace - filter by workspace_id
    return `${nodeAlias}.workspace_id = 'team:${teamId}'`
  } else if (userId) {
    // Personal workspace - filter by user_id AND no workspace_id
    return `${nodeAlias}.user_id = '${userId}' AND ${nodeAlias}.workspace_id IS NULL`
  } else {
    // This shouldn't happen in production
    return '1=0'
  }
}

export async function detectDebuggingPatterns(session: any, limit: number, userId?: string, teamId?: string) {
  await logger.info('Starting debugging pattern detection...', { 
    functionName: 'detectDebuggingPatterns',
    userId,
    teamId 
  })
  
  const patterns = []
  const ownershipFilter = getPatternOwnershipFilter(userId || null, teamId || null, 'e')
  
  // Get debugging seeds with embeddings
  const debugSeeds = await session.run(`
    MATCH (e:EntitySummary)
    WHERE ${ownershipFilter}
      AND e.pattern_signals CONTAINS '"is_debugging":true'
      AND e.embedding IS NOT NULL
    RETURN e.id as id
    ORDER BY e.created_at DESC
    LIMIT 5
  `)
  
  await logger.info(`Found ${debugSeeds.records.length} debugging seeds for semantic search`, {
    functionName: 'detectDebuggingPatterns',
    seedCount: debugSeeds.records.length
  })
  
  if (debugSeeds.records.length === 0) {
    // Fall back to keyword-only detection
    return await detectDebuggingPatternsKeywordOnly(session, limit, userId, teamId)
  }
  
  // Process each seed
  for (const seedRecord of debugSeeds.records) {
    const seedId = getValue(seedRecord, 'id')
    if (!seedId) continue
    
    await logger.debug(`Finding similar debugging entities for seed ${seedId}...`, {
      functionName: 'detectDebuggingPatterns',
      seedId
    })
    
    // Use vector.similarity.cosine for semantic search within the same workspace
    const similarResult = await session.run(`
      MATCH (seed:EntitySummary {id: $seedId})
      MATCH (e:EntitySummary)
      WHERE ${ownershipFilter}
        AND e.id <> seed.id
        AND e.embedding IS NOT NULL
        AND seed.embedding IS NOT NULL
        AND vector.similarity.cosine(seed.embedding, e.embedding) > 0.65
      WITH e, 
           vector.similarity.cosine(seed.embedding, e.embedding) as similarity,
           toString(date(e.created_at)) as day
      RETURN e, similarity, day
      ORDER BY similarity DESC
      LIMIT 100
    `, { seedId })
    
    await logger.info(`Found ${similarResult.records.length} similar entities`, {
      functionName: 'detectDebuggingPatterns',
      entityCount: similarResult.records.length,
      seedId
    })
    
    // Group by project and day
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
      if (group.count >= 3) {
        const avgSimilarity = group.totalSimilarity / group.count
        const pattern = {
          type: 'debugging',
          pattern: 'debugging-session-semantic',
          userId: group.userId,
          workspaceId: group.workspaceId,
          project: group.project,
          day: group.day,
          confidence: Math.min(avgSimilarity * (group.count / 20), 0.95),
          frequency: group.count,
          metadata: {
            avgSimilarity: avgSimilarity,
            detectionMethod: 'semantic-vector-search',
            temporalGrouping: 'daily',
            sampleEntityIds: group.entities.slice(0, 5)
          }
        }
        
        await logger.debug(`Creating semantic debugging pattern for ${group.project} on ${group.day} with ${group.count} entities`, {
          functionName: 'detectDebuggingPatterns',
          project: group.project,
          day: group.day,
          entityCount: group.count
        })
        patterns.push(pattern)
      }
    }
  }
  
  // Also run keyword detection and merge
  const keywordPatterns = await detectDebuggingPatternsKeywordOnly(session, limit, userId, teamId)
  
  // Merge patterns, preferring semantic over keyword
  const mergedPatterns = new Map()
  for (const pattern of [...patterns, ...keywordPatterns]) {
    const key = `${pattern.userId}|${pattern.project}|${pattern.day}`
    
    if (!mergedPatterns.has(key) || pattern.metadata?.detectionMethod?.includes('semantic')) {
      mergedPatterns.set(key, pattern)
    }
  }
  
  const finalPatterns = Array.from(mergedPatterns.values())
  await logger.info(`Debugging pattern detection complete: ${finalPatterns.length} patterns found`, {
    functionName: 'detectDebuggingPatterns',
    patternCount: finalPatterns.length,
    semanticCount: patterns.length,
    keywordCount: keywordPatterns.length
  })
  return finalPatterns
}

async function detectDebuggingPatternsKeywordOnly(session: any, limit: number, userId?: string, teamId?: string) {
  const patterns = []
  const ownershipFilter = getPatternOwnershipFilter(userId || null, teamId || null, 'e')
  
  const result = await session.run(`
    MATCH (e:EntitySummary)
    WHERE ${ownershipFilter}
      AND e.pattern_signals CONTAINS '"is_debugging":true'
    WITH e.user_id as userId,
         e.workspace_id as workspaceId,
         e.project_name as project,
         toString(date(e.created_at)) as day,
         count(e) as debugCount
    WHERE debugCount > 3
    RETURN userId, workspaceId, project, day, debugCount
    ORDER BY debugCount DESC
    LIMIT ${limit}
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

export async function detectLearningPatterns(session: any, limit: number, userId?: string, teamId?: string) {
  await logger.info('Starting learning pattern detection...', { 
    functionName: 'detectLearningPatterns',
    userId,
    teamId 
  })
  
  const patterns = []
  const ownershipFilter = getPatternOwnershipFilter(userId || null, teamId || null, 'e')
  
  // Get learning seeds with embeddings
  const learningSeeds = await session.run(`
    MATCH (e:EntitySummary)
    WHERE ${ownershipFilter}
      AND e.pattern_signals CONTAINS '"is_learning":true'
      AND e.embedding IS NOT NULL
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
    return await detectLearningPatternsKeywordOnly(session, limit, userId, teamId)
  }
  
  // Process each seed
  for (const seedRecord of learningSeeds.records) {
    const seedId = getValue(seedRecord, 'id')
    if (!seedId) continue
    
    await logger.debug(`Finding similar learning entities for seed ${seedId}...`, {
      functionName: 'detectLearningPatterns',
      seedId
    })
    
    // Use vector.similarity.cosine for semantic search within the same workspace
    const similarResult = await session.run(`
      MATCH (seed:EntitySummary {id: $seedId})
      MATCH (e:EntitySummary)
      WHERE ${ownershipFilter}
        AND e.id <> seed.id
        AND e.embedding IS NOT NULL
        AND seed.embedding IS NOT NULL
        AND vector.similarity.cosine(seed.embedding, e.embedding) > 0.65
      WITH e, 
           vector.similarity.cosine(seed.embedding, e.embedding) as similarity,
           toString(date(e.created_at)) as day
      RETURN e, similarity, day
      ORDER BY similarity DESC
      LIMIT 100
    `, { seedId })
    
    await logger.info(`Found ${similarResult.records.length} similar entities`, {
      functionName: 'detectLearningPatterns',
      entityCount: similarResult.records.length,
      seedId
    })
    
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
      if (group.count >= 3) {
        const avgSimilarity = group.totalSimilarity / group.count
        const pattern = {
          type: 'learning',
          pattern: 'research-session-semantic',
          userId: group.userId,
          workspaceId: group.workspaceId,
          project: group.project,
          week: group.week,
          confidence: Math.min(avgSimilarity * (group.count / 15), 0.9),
          frequency: group.count,
          metadata: {
            avgSimilarity: avgSimilarity,
            detectionMethod: 'semantic-vector-search',
            temporalGrouping: 'weekly',
            sampleEntityIds: group.entities.slice(0, 5)
          }
        }
        
        await logger.debug(`Creating semantic learning pattern for ${group.project} with ${group.count} entities`, {
          functionName: 'detectLearningPatterns',
          project: group.project,
          entityCount: group.count
        })
        patterns.push(pattern)
      }
    }
  }
  
  // Also run keyword detection and merge
  const keywordPatterns = await detectLearningPatternsKeywordOnly(session, limit, userId, teamId)
  
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

async function detectLearningPatternsKeywordOnly(session: any, limit: number, userId?: string, teamId?: string) {
  const patterns = []
  const ownershipFilter = getPatternOwnershipFilter(userId || null, teamId || null, 'e')
  
  const result = await session.run(`
    MATCH (e:EntitySummary)
    WHERE ${ownershipFilter}
      AND e.pattern_signals CONTAINS '"is_learning":true'
    WITH e.user_id as userId,
         e.workspace_id as workspaceId,
         e.project_name as project,
         toString(date(e.created_at)) as day,
         count(e) as learnCount
    WHERE learnCount > 3
    RETURN userId, workspaceId, project, day, learnCount
    ORDER BY learnCount DESC
    LIMIT ${limit}
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

// Stub implementations for other pattern types - these need to be updated with workspace filtering
export async function detectRefactoringPatterns(session: any, limit: number, userId?: string, teamId?: string) {
  await logger.info('Refactoring pattern detection not yet updated for workspace filtering', { userId, teamId })
  return []
}

export async function detectProblemSolvingPatterns(session: any, limit: number, userId?: string, teamId?: string) {
  await logger.info('Problem solving pattern detection not yet updated for workspace filtering', { userId, teamId })
  return []
}

export async function detectTemporalSessions(session: any, limit: number, userId?: string, teamId?: string) {
  await logger.info('Temporal session detection not yet updated for workspace filtering', { userId, teamId })
  return []
}

export async function detectSemanticClusters(session: any, limit: number, userId?: string, teamId?: string) {
  await logger.info('Semantic cluster detection not yet updated for workspace filtering', { userId, teamId })
  return []
}

export async function detectMemoryCodeRelationships(session: any, limit: number, userId?: string, teamId?: string) {
  await logger.info('Memory-code relationship detection not yet updated for workspace filtering', { userId, teamId })
  return []
}

export async function mergeAndStorePatterns(session: any, patterns: any[]) {
  await logger.info(`Storing ${patterns.length} patterns...`, {
    functionName: 'mergeAndStorePatterns',
    patternCount: patterns.length
  })
  
  if (patterns.length === 0) {
    return 0
  }
  
  let storedCount = 0
  
  for (const pattern of patterns) {
    try {
      // Store pattern in Neo4j
      await session.run(`
        MERGE (p:Pattern {
          type: $type,
          pattern: $pattern,
          user_id: $userId,
          workspace_id: $workspaceId,
          project_name: $project,
          temporal_key: $temporalKey
        })
        ON CREATE SET
          p.id = randomUUID(),
          p.created_at = datetime(),
          p.confidence = $confidence,
          p.frequency = $frequency,
          p.metadata = $metadata,
          p.first_seen = datetime(),
          p.last_seen = datetime()
        ON MATCH SET
          p.confidence = CASE 
            WHEN $confidence > p.confidence THEN $confidence 
            ELSE p.confidence 
          END,
          p.frequency = p.frequency + $frequency,
          p.last_seen = datetime(),
          p.metadata = CASE
            WHEN $metadata.detectionMethod CONTAINS 'semantic' 
            THEN $metadata
            ELSE p.metadata
          END
      `, {
        type: pattern.type,
        pattern: pattern.pattern,
        userId: pattern.userId,
        workspaceId: pattern.workspaceId,
        project: pattern.project,
        temporalKey: pattern.day || pattern.week || 'all-time',
        confidence: pattern.confidence,
        frequency: pattern.frequency,
        metadata: JSON.stringify(pattern.metadata)
      })
      
      storedCount++
    } catch (error) {
      await logger.error('Failed to store pattern', error, { pattern })
    }
  }
  
  await logger.info(`Successfully stored ${storedCount} patterns`, {
    functionName: 'mergeAndStorePatterns',
    storedCount,
    totalPatterns: patterns.length
  })
  
  return storedCount
}