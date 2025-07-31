/**
 * Optimized queries for pattern discovery
 * These queries are designed to use indexes efficiently and avoid timeouts
 */

import { neo4jService } from '../service'

export const OptimizedQueries = {
  /**
   * Simple temporal sequence detection
   * Uses user_id index first, then filters
   */
  temporalSequence: `
    // Start with indexed user lookup
    MATCH (m:Memory {user_id: $userId})
    WHERE m.project_name = $projectName
      AND m.created_at IS NOT NULL
    WITH m
    ORDER BY m.created_at DESC
    LIMIT 100  // Process only recent memories
    
    // Collect into ordered list
    WITH collect(m) as memories
    WHERE size(memories) > 1
    
    // Simple sequence detection
    UNWIND range(0, size(memories)-2) as i
    WITH memories[i] as m1, memories[i+1] as m2
    WHERE duration.between(datetime(m2.created_at), datetime(m1.created_at)).minutes < 30
    
    RETURN 'sequential-work' as pattern,
           COUNT(*) as frequency,
           AVG(duration.between(datetime(m2.created_at), datetime(m1.created_at)).minutes) as avgGap
  `,

  /**
   * Work session detection (simplified)
   */
  workSessions: `
    // Use composite index
    MATCH (m:Memory)
    WHERE m.user_id = $userId
      AND m.project_name = $projectName
      AND m.created_at >= datetime() - duration({days: 7})
    WITH date(datetime(m.created_at)) as day, 
         COUNT(m) as dailyCount
    WHERE dailyCount > 5
    RETURN day, dailyCount
    ORDER BY day DESC
    LIMIT 7
  `,

  /**
   * Simple debugging pattern
   */
  debuggingPattern: `
    // Use full-text search if available
    MATCH (m:Memory)
    WHERE m.user_id = $userId
      AND m.project_name = $projectName
      AND (m.content CONTAINS 'error' OR m.content CONTAINS 'fix' OR m.content CONTAINS 'bug')
    WITH date(datetime(m.created_at)) as debugDay, COUNT(m) as debugCount
    WHERE debugCount > 3
    RETURN debugDay, debugCount
    ORDER BY debugDay DESC
    LIMIT 10
  `,

  /**
   * Memory-code relationships (simplified)
   */
  memoryCodeBasic: `
    // Count relationships only, don't calculate similarity in query
    MATCH (m:Memory {user_id: $userId})
    WHERE m.project_name = $projectName
    WITH m
    LIMIT 50
    
    OPTIONAL MATCH (m)-[r:DISCUSSES|REFERENCES_CODE]->(c:CodeEntity)
    WITH m, COUNT(c) as codeRefs
    WHERE codeRefs > 0
    
    RETURN COUNT(m) as memoriesWithCode,
           AVG(codeRefs) as avgCodeRefs
  `,

  /**
   * Context switching detection
   */
  contextSwitching: `
    MATCH (m:Memory {user_id: $userId})
    WHERE m.created_at >= datetime() - duration({days: 1})
    WITH m
    ORDER BY m.created_at
    LIMIT 200
    
    WITH collect(m) as memories
    UNWIND range(0, size(memories)-2) as i
    
    WITH memories[i] as m1, memories[i+1] as m2
    WHERE m1.project_name <> m2.project_name
      AND duration.between(datetime(m1.created_at), datetime(m2.created_at)).minutes < 30
    
    RETURN COUNT(*) as switchCount,
           COLLECT(DISTINCT m1.project_name)[0..5] as projects
  `,

  /**
   * Check if patterns exist for a user
   */
  hasPatterns: `
    MATCH (p:Pattern)
    WHERE p.userId = $userId
      OR p.teamId IN $teamIds
      OR p.isPublic = true
    RETURN COUNT(p) as patternCount
    LIMIT 1
  `,

  /**
   * Get recent patterns
   */
  recentPatterns: `
    MATCH (p:Pattern)
    WHERE (p.userId = $userId OR p.teamId IN $teamIds OR p.isPublic = true)
      AND p.lastValidated >= datetime() - duration({days: 7})
    RETURN p
    ORDER BY p.confidence DESC
    LIMIT 20
  `
}

/**
 * Query optimization strategies
 */
export const QueryOptimizations = {
  /**
   * Always filter by user/workspace first
   */
  userFilter: (userId: string, workspaceId?: string) => {
    if (workspaceId) {
      return `WHERE m.workspace_id = '${workspaceId}'`
    }
    return `WHERE m.user_id = '${userId}'`
  },

  /**
   * Add time range filters to reduce data
   */
  timeFilter: (days: number = 30) => {
    return `AND m.created_at >= datetime() - duration({days: ${days}})`
  },

  /**
   * Limit early to avoid processing too much data
   */
  earlyLimit: (limit: number = 100) => {
    return `WITH m LIMIT ${limit}`
  },

  /**
   * Use sampling for large datasets
   */
  sampling: (percentage: number = 10) => {
    return `WHERE rand() < ${percentage / 100}`
  }
}

/**
 * Batch pattern discovery strategy
 */
export class BatchPatternDiscovery {
  /**
   * Discover patterns in small batches to avoid timeouts
   */
  static async discoverInBatches(options: {
    userId: string
    projectName: string
    batchSize?: number
  }) {
    const batchSize = options.batchSize || 100
    const patterns: any[] = []
    
    // Process temporal patterns
    const temporalResult = await neo4jService.executeQuery(
      OptimizedQueries.temporalSequence,
      {
        userId: options.userId,
        projectName: options.projectName
      }
    )
    
    if (temporalResult.records.length > 0) {
      patterns.push({
        type: 'temporal',
        data: temporalResult.records[0]
      })
    }
    
    // Process work sessions
    const sessionResult = await neo4jService.executeQuery(
      OptimizedQueries.workSessions,
      {
        userId: options.userId,
        projectName: options.projectName
      }
    )
    
    if (sessionResult.records.length > 0) {
      patterns.push({
        type: 'work-sessions',
        data: sessionResult.records
      })
    }
    
    return patterns
  }
}