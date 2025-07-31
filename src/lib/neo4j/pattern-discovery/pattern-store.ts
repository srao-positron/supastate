/**
 * Centralized Pattern Storage
 * 
 * Stores discovered patterns in Neo4j for:
 * - Persistence across sessions
 * - Pattern evolution tracking
 * - Cross-workspace/team pattern sharing (with privacy controls)
 * - Pattern-based predictions
 */

import { neo4jService } from '../service'
import { log } from '@/lib/logger'
import { Pattern, PatternType } from './types'
import { getNumericValue } from './utils'

export interface StoredPattern extends Pattern {
  storedAt: string
  lastValidated: string
  validationCount: number
  workspaceId?: string
  teamId?: string
  userId?: string
  isPublic: boolean
}

export class PatternStore {
  /**
   * Store a discovered pattern in Neo4j
   */
  async storePattern(pattern: Pattern, context: {
    workspaceId?: string
    teamId?: string
    userId?: string
    isPublic?: boolean
  }): Promise<void> {
    const query = `
      MERGE (p:Pattern {id: $id})
      SET p += {
        type: $type,
        name: $name,
        description: $description,
        confidence: $confidence,
        frequency: $frequency,
        metadata: $metadata,
        storedAt: datetime(),
        lastValidated: datetime(),
        validationCount: COALESCE(p.validationCount, 0) + 1,
        workspaceId: $workspaceId,
        teamId: $teamId,
        userId: $userId,
        isPublic: $isPublic
      }
      
      // Store evidence as separate nodes for richer querying
      WITH p
      UNWIND $evidence as ev
      MERGE (e:Evidence {
        patternId: p.id,
        type: ev.type,
        description: ev.description
      })
      SET e.weight = ev.weight
      MERGE (p)-[:HAS_EVIDENCE]->(e)
      
      RETURN p
    `
    
    try {
      await neo4jService.executeQuery(query, {
        id: pattern.id,
        type: pattern.type,
        name: pattern.name,
        description: pattern.description,
        confidence: pattern.confidence,
        frequency: pattern.frequency,
        metadata: JSON.stringify(pattern.metadata || {}),
        evidence: pattern.evidence,
        workspaceId: context.workspaceId,
        teamId: context.teamId,
        userId: context.userId,
        isPublic: context.isPublic || false
      })
      
      log.info('Pattern stored', { patternId: pattern.id, type: pattern.type })
    } catch (error) {
      log.error('Failed to store pattern', error, { patternId: pattern.id })
      throw error
    }
  }
  
  /**
   * Retrieve patterns with multi-tenant filtering
   */
  async getPatterns(filters: {
    workspaceId?: string
    teamId?: string
    userId?: string
    type?: PatternType
    minConfidence?: number
    limit?: number
  } = {}): Promise<StoredPattern[]> {
    const query = `
      MATCH (p:Pattern)
      WHERE ($workspaceId IS NULL OR p.workspaceId = $workspaceId)
        AND ($teamId IS NULL OR p.teamId = $teamId OR p.isPublic = true)
        AND ($userId IS NULL OR p.userId = $userId OR p.teamId IS NOT NULL OR p.isPublic = true)
        AND ($type IS NULL OR p.type = $type)
        AND p.confidence >= $minConfidence
      
      // Get evidence
      OPTIONAL MATCH (p)-[:HAS_EVIDENCE]->(e:Evidence)
      
      WITH p, collect({
        type: e.type,
        description: e.description,
        weight: e.weight,
        examples: []
      }) as evidence
      
      RETURN p.id as id,
             p.type as type,
             p.name as name,
             p.description as description,
             p.confidence as confidence,
             p.frequency as frequency,
             p.metadata as metadata,
             p.storedAt as storedAt,
             p.lastValidated as lastValidated,
             p.validationCount as validationCount,
             p.workspaceId as workspaceId,
             p.teamId as teamId,
             p.userId as userId,
             p.isPublic as isPublic,
             evidence
      ORDER BY p.confidence DESC
      LIMIT $limit
    `
    
    const result = await neo4jService.executeQuery(query, {
      workspaceId: filters.workspaceId,
      teamId: filters.teamId,
      userId: filters.userId,
      type: filters.type,
      minConfidence: filters.minConfidence || 0.5,
      limit: filters.limit || 100
    })
    
    return result.records.map((record: any) => ({
      id: record.id,
      type: record.type as PatternType,
      name: record.name,
      description: record.description,
      confidence: getNumericValue(record.confidence),
      frequency: getNumericValue(record.frequency),
      evidence: record.evidence || [],
      metadata: typeof record.metadata === 'string' ? JSON.parse(record.metadata) : record.metadata,
      storedAt: record.storedAt,
      lastValidated: record.lastValidated,
      validationCount: getNumericValue(record.validationCount),
      workspaceId: record.workspaceId,
      teamId: record.teamId,
      userId: record.userId,
      isPublic: record.isPublic
    } as StoredPattern))
  }
  
  /**
   * Update pattern confidence based on validation
   */
  async updatePatternConfidence(
    patternId: string, 
    newConfidence: number,
    stillValid: boolean
  ): Promise<void> {
    const query = `
      MATCH (p:Pattern {id: $patternId})
      SET p.confidence = $confidence,
          p.lastValidated = datetime(),
          p.validationCount = p.validationCount + 1,
          p.isValid = $stillValid
      RETURN p
    `
    
    await neo4jService.executeQuery(query, {
      patternId,
      confidence: newConfidence,
      stillValid
    })
  }
  
  /**
   * Find similar patterns across workspaces (for learning)
   */
  async findSimilarPatterns(
    pattern: Pattern,
    context: { workspaceId?: string, teamId?: string }
  ): Promise<StoredPattern[]> {
    const query = `
      MATCH (p:Pattern)
      WHERE p.type = $type
        AND p.id <> $patternId
        AND (p.isPublic = true OR p.teamId = $teamId)
        AND p.confidence > 0.7
      
      // Calculate similarity based on metadata
      WITH p,
           CASE
             WHEN p.name CONTAINS $nameKeyword THEN 0.3
             ELSE 0.0
           END +
           CASE
             WHEN p.description CONTAINS $descKeyword THEN 0.2
             ELSE 0.0
           END +
           CASE
             WHEN abs(p.confidence - $confidence) < 0.1 THEN 0.2
             ELSE 0.0
           END +
           CASE
             WHEN abs(p.frequency - $frequency) < 10 THEN 0.3
             ELSE 0.0
           END as similarity
      
      WHERE similarity > 0.5
      
      OPTIONAL MATCH (p)-[:HAS_EVIDENCE]->(e:Evidence)
      
      WITH p, similarity, collect({
        type: e.type,
        description: e.description,
        weight: e.weight,
        examples: []
      }) as evidence
      
      RETURN p.id as id,
             p.type as type,
             p.name as name,
             p.description as description,
             p.confidence as confidence,
             p.frequency as frequency,
             p.metadata as metadata,
             p.storedAt as storedAt,
             p.lastValidated as lastValidated,
             p.validationCount as validationCount,
             p.workspaceId as workspaceId,
             p.teamId as teamId,
             p.userId as userId,
             p.isPublic as isPublic,
             evidence,
             similarity
      ORDER BY similarity DESC
      LIMIT 10
    `
    
    // Extract keywords for similarity matching
    const nameKeyword = pattern.name.split(':')[1]?.trim() || pattern.name
    const descKeyword = pattern.description.split(' ').slice(0, 3).join(' ')
    
    const result = await neo4jService.executeQuery(query, {
      type: pattern.type,
      patternId: pattern.id,
      teamId: context.teamId,
      nameKeyword,
      descKeyword,
      confidence: pattern.confidence,
      frequency: pattern.frequency
    })
    
    return result.records.map((record: any) => ({
      id: record.id,
      type: record.type as PatternType,
      name: record.name,
      description: record.description,
      confidence: getNumericValue(record.confidence),
      frequency: getNumericValue(record.frequency),
      evidence: record.evidence || [],
      metadata: typeof record.metadata === 'string' ? JSON.parse(record.metadata) : record.metadata,
      storedAt: record.storedAt,
      lastValidated: record.lastValidated,
      validationCount: getNumericValue(record.validationCount),
      workspaceId: record.workspaceId,
      teamId: record.teamId,
      userId: record.userId,
      isPublic: record.isPublic
    } as StoredPattern))
  }
  
  /**
   * Create relationships between patterns
   */
  async linkPatterns(
    pattern1Id: string,
    pattern2Id: string,
    relationshipType: 'LEADS_TO' | 'CORRELATES_WITH' | 'CONTRADICTS' | 'ENABLES',
    confidence: number = 0.7
  ): Promise<void> {
    const query = `
      MATCH (p1:Pattern {id: $pattern1Id})
      MATCH (p2:Pattern {id: $pattern2Id})
      MERGE (p1)-[r:${relationshipType}]->(p2)
      SET r.confidence = $confidence,
          r.discoveredAt = datetime(),
          r.validationCount = COALESCE(r.validationCount, 0) + 1
      RETURN r
    `
    
    await neo4jService.executeQuery(query, {
      pattern1Id,
      pattern2Id,
      confidence
    })
  }
  
  /**
   * Get pattern evolution over time
   */
  async getPatternEvolution(
    patternId: string,
    context: { workspaceId?: string }
  ): Promise<{
    pattern: StoredPattern
    history: Array<{
      timestamp: string
      confidence: number
      frequency: number
    }>
    relatedPatterns: Array<{
      pattern: StoredPattern
      relationship: string
      confidence: number
    }>
  }> {
    // Get current pattern
    const patternQuery = `
      MATCH (p:Pattern {id: $patternId})
      WHERE $workspaceId IS NULL OR p.workspaceId = $workspaceId OR p.isPublic = true
      OPTIONAL MATCH (p)-[:HAS_EVIDENCE]->(e:Evidence)
      WITH p, collect({
        type: e.type,
        description: e.description,
        weight: e.weight,
        examples: []
      }) as evidence
      RETURN p, evidence
    `
    
    const patternResult = await neo4jService.executeQuery(patternQuery, {
      patternId,
      workspaceId: context.workspaceId
    })
    
    if (patternResult.records.length === 0) {
      throw new Error('Pattern not found or access denied')
    }
    
    const patternRecord = patternResult.records[0]
    const p = patternRecord.p || patternRecord.get('p')
    
    const pattern: StoredPattern = {
      id: p.id,
      type: p.type as PatternType,
      name: p.name,
      description: p.description,
      confidence: getNumericValue(p.confidence),
      frequency: getNumericValue(p.frequency),
      evidence: patternRecord.evidence || [],
      metadata: typeof p.metadata === 'string' ? JSON.parse(p.metadata) : p.metadata,
      storedAt: p.storedAt,
      lastValidated: p.lastValidated,
      validationCount: getNumericValue(p.validationCount),
      workspaceId: p.workspaceId,
      teamId: p.teamId,
      userId: p.userId,
      isPublic: p.isPublic
    }
    
    // Get pattern history (would need event tracking to be fully implemented)
    const history = [{
      timestamp: pattern.storedAt,
      confidence: pattern.confidence,
      frequency: pattern.frequency
    }]
    
    // Get related patterns
    const relatedQuery = `
      MATCH (p:Pattern {id: $patternId})-[r]->(related:Pattern)
      WHERE type(r) IN ['LEADS_TO', 'CORRELATES_WITH', 'CONTRADICTS', 'ENABLES']
        AND ($workspaceId IS NULL OR related.workspaceId = $workspaceId OR related.isPublic = true)
      RETURN related, type(r) as relationship, r.confidence as confidence
      LIMIT 20
    `
    
    const relatedResult = await neo4jService.executeQuery(relatedQuery, {
      patternId,
      workspaceId: context.workspaceId
    })
    
    const relatedPatterns = relatedResult.records.map((record: any) => {
      const related = record.related || record.get('related')
      return {
        pattern: {
          id: related.id,
          type: related.type as PatternType,
          name: related.name,
          description: related.description,
          confidence: getNumericValue(related.confidence),
          frequency: getNumericValue(related.frequency),
          evidence: [],
          metadata: typeof related.metadata === 'string' ? JSON.parse(related.metadata) : related.metadata,
          storedAt: related.storedAt,
          lastValidated: related.lastValidated,
          validationCount: getNumericValue(related.validationCount),
          workspaceId: related.workspaceId,
          teamId: related.teamId,
          userId: related.userId,
          isPublic: related.isPublic
        } as StoredPattern,
        relationship: record.relationship,
        confidence: getNumericValue(record.confidence)
      }
    })
    
    return {
      pattern,
      history,
      relatedPatterns
    }
  }
  
  /**
   * Clean up old or invalid patterns
   */
  async cleanupPatterns(options: {
    maxAge?: number // days
    minValidationCount?: number
    minConfidence?: number
  } = {}): Promise<number> {
    const query = `
      MATCH (p:Pattern)
      WHERE (p.lastValidated < datetime() - duration({days: $maxAge}))
        OR (p.validationCount < $minValidationCount AND p.storedAt < datetime() - duration({days: 7}))
        OR (p.confidence < $minConfidence AND p.isValid = false)
      
      // Delete evidence relationships first
      OPTIONAL MATCH (p)-[:HAS_EVIDENCE]->(e:Evidence)
      DELETE e
      
      WITH p
      DELETE p
      RETURN COUNT(p) as deletedCount
    `
    
    const result = await neo4jService.executeQuery(query, {
      maxAge: options.maxAge || 90,
      minValidationCount: options.minValidationCount || 3,
      minConfidence: options.minConfidence || 0.3
    })
    
    const deletedCount = getNumericValue(result.records[0]?.deletedCount)
    log.info('Cleaned up patterns', { deletedCount })
    
    return deletedCount
  }
}

// Export singleton instance
export const patternStore = new PatternStore()