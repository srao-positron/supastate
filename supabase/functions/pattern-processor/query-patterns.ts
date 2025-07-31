/**
 * Standard query patterns for handling user/workspace filtering in Neo4j
 * 
 * CRITICAL: All Neo4j queries MUST use these patterns to handle the dual nature of data:
 * - Early data: Associated with user_id only (no workspace_id)
 * - Team data: Associated with workspace_id (and possibly user_id)
 */

/**
 * Get the ownership filter for any node type
 * This handles both user-owned and workspace-owned entities
 */
export function getOwnershipFilter(params: {
  userId?: string
  workspaceId?: string
  nodeAlias?: string
}): string {
  const alias = params.nodeAlias || 'n'
  
  if (params.workspaceId) {
    // When user is part of a workspace, get both their personal data AND workspace data
    return `(${alias}.workspace_id = $workspaceId OR (${alias}.user_id = $userId AND ${alias}.workspace_id IS NULL))`
  } else if (params.userId) {
    // When user is not part of a workspace, only get their personal data
    return `(${alias}.user_id = $userId AND ${alias}.workspace_id IS NULL)`
  } else {
    throw new Error('Either userId or workspaceId must be provided')
  }
}

/**
 * Get ownership parameters for queries
 */
export function getOwnershipParams(params: {
  userId?: string
  workspaceId?: string
  teamId?: string
}): Record<string, any> {
  const queryParams: Record<string, any> = {}
  
  if (params.userId) queryParams.userId = params.userId
  if (params.workspaceId) queryParams.workspaceId = params.workspaceId
  if (params.teamId) queryParams.teamId = params.teamId
  
  return queryParams
}

/**
 * Standard queries using proper ownership filters
 */
export const StandardQueries = {
  /**
   * Count memories for a user/workspace
   */
  countMemories: (userId?: string, workspaceId?: string) => ({
    query: `
      MATCH (m:Memory)
      WHERE ${getOwnershipFilter({ userId, workspaceId, nodeAlias: 'm' })}
      RETURN count(m) as count
    `,
    params: getOwnershipParams({ userId, workspaceId })
  }),

  /**
   * Get memories needing summaries
   */
  memoriesNeedingSummaries: (userId?: string, workspaceId?: string, limit: number = 100) => ({
    query: `
      MATCH (m:Memory)
      WHERE ${getOwnershipFilter({ userId, workspaceId, nodeAlias: 'm' })}
        AND m.content IS NOT NULL 
        AND m.embedding IS NOT NULL
        AND NOT EXISTS((m)<-[:SUMMARIZES]-(:EntitySummary))
      RETURN m
      ORDER BY m.created_at DESC
      LIMIT $limit
    `,
    params: { ...getOwnershipParams({ userId, workspaceId }), limit }
  }),

  /**
   * Get code entities for a user/workspace
   */
  codeEntities: (userId?: string, workspaceId?: string) => ({
    query: `
      MATCH (c:CodeEntity)
      WHERE ${getOwnershipFilter({ userId, workspaceId, nodeAlias: 'c' })}
      RETURN c
    `,
    params: getOwnershipParams({ userId, workspaceId })
  }),

  /**
   * Get summaries for pattern detection
   */
  summariesForPatterns: (userId?: string, workspaceId?: string, timeWindow?: string) => {
    let timeFilter = ''
    if (timeWindow) {
      switch (timeWindow) {
        case 'hour':
          timeFilter = 'AND e.created_at > datetime() - duration({hours: 1})'
          break
        case 'day':
          timeFilter = 'AND e.created_at > datetime() - duration({days: 1})'
          break
        case 'week':
          timeFilter = 'AND e.created_at > datetime() - duration({days: 7})'
          break
      }
    }
    
    return {
      query: `
        MATCH (e:EntitySummary)
        WHERE ${getOwnershipFilter({ userId, workspaceId, nodeAlias: 'e' })}
          ${timeFilter}
        RETURN e
        ORDER BY e.created_at DESC
      `,
      params: getOwnershipParams({ userId, workspaceId })
    }
  },

  /**
   * Create summary with proper ownership
   */
  createSummary: (entityType: 'memory' | 'code') => ({
    query: `
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
        processed_at: datetime(),
        embedding: $embedding,
        keyword_frequencies: $keywords,
        pattern_signals: $patternSignals
      })
      WITH s
      MATCH (e {id: $entityId})
      CREATE (s)-[:SUMMARIZES]->(e)
      RETURN s
    `,
    // params should be provided at runtime
  })
}

/**
 * Helper to get user context from various sources
 */
export function getUserContext(source: {
  userId?: string
  workspaceId?: string
  teamId?: string
  user?: { id: string }
  workspace?: { id: string; team_id?: string }
}): {
  userId: string | undefined
  workspaceId: string | undefined
  teamId: string | undefined
} {
  return {
    userId: source.userId || source.user?.id,
    workspaceId: source.workspaceId || source.workspace?.id,
    teamId: source.teamId || source.workspace?.team_id
  }
}

/**
 * Migration helper to update old data
 */
export const MigrationQueries = {
  /**
   * Add workspace_id to user's memories when they join a workspace
   */
  associateMemoriesWithWorkspace: (userId: string, workspaceId: string) => ({
    query: `
      MATCH (m:Memory)
      WHERE m.user_id = $userId 
        AND m.workspace_id IS NULL
      SET m.workspace_id = $workspaceId
      RETURN count(m) as updated
    `,
    params: { userId, workspaceId }
  }),

  /**
   * Fix orphaned data (no user_id or workspace_id)
   */
  identifyOrphanedData: () => ({
    query: `
      MATCH (n)
      WHERE (n:Memory OR n:CodeEntity OR n:EntitySummary)
        AND n.user_id IS NULL 
        AND n.workspace_id IS NULL
      RETURN labels(n)[0] as type, count(n) as count
    `,
    params: {}
  })
}