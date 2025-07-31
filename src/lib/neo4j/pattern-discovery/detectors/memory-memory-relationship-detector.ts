/**
 * Memory-to-Memory Relationship Detector
 * 
 * Discovers relationships between memories using:
 * - Semantic similarity (embeddings) 
 * - Temporal proximity
 * - Content patterns
 * - User sessions
 */

import { neo4jService } from '../../service'
import { log } from '@/lib/logger'
import { Pattern, PatternType, PatternDetector, Evidence } from '../types'

interface MemoryRelationshipPattern extends Pattern {
  relationshipType: 'PRECEDED_BY' | 'RELATED_TO' | 'EVOLVED_INTO' | 'CONTRADICTS' | 'SUPPORTS'
  averageSimilarity?: number
  averageTimeGap?: number
}

export class MemoryMemoryRelationshipDetector implements PatternDetector {
  
  async detectPatterns(options: {
    workspaceId?: string
    projectName?: string
    timeRange?: { start: Date, end: Date }
    minConfidence?: number
    similarityThreshold?: number
  } = {}): Promise<MemoryRelationshipPattern[]> {
    log.info('Detecting memory-to-memory relationships', options)
    
    const patterns: MemoryRelationshipPattern[] = []
    const similarityThreshold = options.similarityThreshold || 0.8 // Higher threshold for memory-memory
    
    // Run different relationship detections
    const [
      semanticRelationships,
      temporalRelationships,
      evolutionRelationships,
      supportRelationships
    ] = await Promise.all([
      this.detectSemanticRelationships(options, similarityThreshold),
      this.detectTemporalRelationships(options),
      this.detectEvolutionRelationships(options),
      this.detectSupportContradictionRelationships(options)
    ])
    
    patterns.push(...semanticRelationships)
    patterns.push(...temporalRelationships)
    patterns.push(...evolutionRelationships)
    patterns.push(...supportRelationships)
    
    // Create high-confidence relationships
    await this.createRelationships(patterns.filter(p => p.confidence > 0.7))
    
    return patterns
  }
  
  /**
   * Detect semantic relationships between memories
   */
  private async detectSemanticRelationships(
    options: any, 
    similarityThreshold: number
  ): Promise<MemoryRelationshipPattern[]> {
    // First check if embeddings exist
    const checkQuery = `
      MATCH (m:Memory)
      WHERE m.embedding IS NOT NULL
      RETURN COUNT(m) as count
      LIMIT 1
    `
    
    const checkResult = await neo4jService.executeQuery(checkQuery, {})
    if ((checkResult.records[0]?.count?.toNumber() || 0) === 0) {
      log.warn('No memory embeddings found. Skipping semantic memory relationships.')
      return []
    }
    
    const query = `
      // Sample memories from the same project
      MATCH (m1:Memory)
      WHERE m1.embedding IS NOT NULL
        AND m1.project_name IS NOT NULL
        ${options.projectName ? 'AND m1.project_name = $projectName' : ''}
      WITH m1 LIMIT 100  // Sample size
      
      MATCH (m2:Memory)
      WHERE m2.embedding IS NOT NULL
        AND m2.project_name = m1.project_name
        AND m2.id <> m1.id
        AND datetime(m2.created_at) > datetime(m1.created_at)  // Only forward relationships
      WITH m1, m2 LIMIT 500  // Limit combinations
      
      // Calculate similarity
      WITH m1, m2,
           gds.similarity.cosine(m1.embedding, m2.embedding) as similarity,
           duration.between(datetime(m1.created_at), datetime(m2.created_at)).hours as timeDiff
      WHERE similarity > $similarityThreshold
      
      // Group by similarity level and time difference
      WITH CASE
             WHEN similarity > 0.95 THEN 'near-duplicate'
             WHEN similarity > 0.9 THEN 'very-similar'
             ELSE 'similar'
           END as similarityLevel,
           CASE
             WHEN timeDiff < 1 THEN 'immediate'
             WHEN timeDiff < 24 THEN 'same-day'
             WHEN timeDiff < 168 THEN 'same-week'
             ELSE 'distant'
           END as timeRelation,
           AVG(similarity) as avgSimilarity,
           AVG(timeDiff) as avgTimeDiff,
           COUNT(*) as frequency,
           COLLECT({
             m1: m1.id,
             m2: m2.id,
             similarity: similarity,
             timeDiff: timeDiff
           })[0..10] as examples
      
      WHERE frequency > 2
      RETURN similarityLevel, timeRelation, avgSimilarity, avgTimeDiff, frequency, examples
      ORDER BY avgSimilarity DESC
    `
    
    const result = await neo4jService.executeQuery(query, {
      projectName: options.projectName,
      similarityThreshold
    })
    
    return result.records.map((record: any) => ({
      id: `memory-memory-semantic-${record.similarityLevel}-${record.timeRelation}`,
      type: PatternType.TEMPORAL,
      name: `Memory Similarity: ${record.similarityLevel} (${record.timeRelation})`,
      description: `Memories with ${record.avgSimilarity?.toNumber()?.toFixed(3)} similarity, ${record.avgTimeDiff?.toNumber()?.toFixed(1)}h apart`,
      confidence: record.avgSimilarity?.toNumber() || 0,
      frequency: record.frequency?.toNumber() || 0,
      evidence: [
        {
          type: 'semantic',
          description: `Average similarity: ${record.avgSimilarity?.toNumber()?.toFixed(3)}`,
          weight: 0.7,
          examples: record.examples.map((e: any) => e.m1)
        },
        {
          type: 'temporal',
          description: `${record.timeRelation} relationship (avg ${record.avgTimeDiff?.toNumber()?.toFixed(1)}h)`,
          weight: 0.3,
          examples: record.examples.map((e: any) => e.m2)
        }
      ],
      relationshipType: 'RELATED_TO',
      averageSimilarity: record.avgSimilarity?.toNumber(),
      averageTimeGap: record.avgTimeDiff?.toNumber(),
      metadata: {
        similarityLevel: record.similarityLevel,
        timeRelation: record.timeRelation,
        examples: record.examples
      }
    } as MemoryRelationshipPattern))
  }
  
  /**
   * Detect temporal relationships between memories
   */
  private async detectTemporalRelationships(options: any): Promise<MemoryRelationshipPattern[]> {
    const query = `
      // Find memories in temporal sequence
      MATCH (m1:Memory)
      WHERE m1.created_at IS NOT NULL
        ${options.projectName ? 'AND m1.project_name = $projectName' : ''}
      
      MATCH (m2:Memory)
      WHERE m2.created_at IS NOT NULL
        AND m2.project_name = m1.project_name
        AND m2.id <> m1.id
        AND datetime(m2.created_at) > datetime(m1.created_at)
        AND datetime(m2.created_at) <= datetime(m1.created_at) + duration({minutes: 30})
      
      WITH m1, m2,
           duration.between(datetime(m1.created_at), datetime(m2.created_at)).minutes as timeGap,
           CASE
             WHEN m1.user_id = m2.user_id THEN 'same-user'
             ELSE 'different-user'
           END as userContext,
           CASE
             WHEN m1.chunk_id IS NOT NULL AND m1.chunk_id = m2.chunk_id THEN 'same-chunk'
             WHEN m1.session_id IS NOT NULL AND m1.session_id = m2.session_id THEN 'same-session'
             ELSE 'different-context'
           END as contextType
      
      WITH contextType, userContext,
           AVG(timeGap) as avgTimeGap,
           COUNT(*) as frequency,
           COLLECT({
             m1: m1.id,
             m2: m2.id,
             gap: timeGap
           })[0..10] as examples
      
      WHERE frequency > 5
      RETURN contextType, userContext, avgTimeGap, frequency, examples
      ORDER BY frequency DESC
    `
    
    const result = await neo4jService.executeQuery(query, {
      projectName: options.projectName
    })
    
    return result.records.map((record: any) => ({
      id: `memory-memory-temporal-${record.contextType}-${record.userContext}`,
      type: PatternType.TEMPORAL,
      name: `Temporal Sequence: ${record.contextType} (${record.userContext})`,
      description: `Sequential memories in ${record.contextType} with ${record.avgTimeGap?.toNumber()?.toFixed(1)}min gap`,
      confidence: 0.8,
      frequency: record.frequency?.toNumber() || 0,
      evidence: [
        {
          type: 'temporal',
          description: `Average gap: ${record.avgTimeGap?.toNumber()?.toFixed(1)} minutes`,
          weight: 0.6,
          examples: record.examples.map((e: any) => e.m1)
        },
        {
          type: 'structural',
          description: `Context: ${record.contextType}, ${record.userContext}`,
          weight: 0.4,
          examples: record.examples.map((e: any) => e.m2)
        }
      ],
      relationshipType: 'PRECEDED_BY',
      averageTimeGap: record.avgTimeGap?.toNumber(),
      metadata: {
        contextType: record.contextType,
        userContext: record.userContext,
        examples: record.examples
      }
    } as MemoryRelationshipPattern))
  }
  
  /**
   * Detect knowledge evolution patterns
   */
  private async detectEvolutionRelationships(options: any): Promise<MemoryRelationshipPattern[]> {
    // Keywords that suggest evolution of understanding
    const evolutionKeywords = [
      'understand', 'realize', 'learn', 'discover', 'now I see', 'actually',
      'better way', 'improved', 'refactor', 'optimize', 'enhance'
    ]
    
    const query = `
      // Find memories that show evolution of understanding
      MATCH (m1:Memory)
      WHERE m1.content IS NOT NULL
        ${options.projectName ? 'AND m1.project_name = $projectName' : ''}
      
      MATCH (m2:Memory)
      WHERE m2.content IS NOT NULL
        AND m2.project_name = m1.project_name
        AND m2.id <> m1.id
        AND datetime(m2.created_at) > datetime(m1.created_at)
        AND datetime(m2.created_at) <= datetime(m1.created_at) + duration({days: 7})
        AND (${evolutionKeywords.map((k: any) => `toLower(m2.content) CONTAINS '${k}'`).join(' OR ')})
      
      // Check if they discuss similar topics (without embeddings, use content overlap)
      WITH m1, m2,
           duration.between(datetime(m1.created_at), datetime(m2.created_at)).hours as hoursDiff,
           SIZE([word IN split(toLower(m1.content), ' ') WHERE word IN split(toLower(m2.content), ' ')]) as commonWords
      WHERE commonWords > 10  // At least 10 common words
      
      WITH AVG(hoursDiff) as avgHoursDiff,
           AVG(commonWords) as avgCommonWords,
           COUNT(*) as frequency,
           COLLECT({
             m1: m1.id,
             m2: m2.id,
             hoursDiff: hoursDiff,
             commonWords: commonWords
           })[0..5] as examples
      
      WHERE frequency > 2
      RETURN avgHoursDiff, avgCommonWords, frequency, examples
    `
    
    const result = await neo4jService.executeQuery(query, {
      projectName: options.projectName
    })
    
    return result.records.map((record: any) => ({
      id: 'memory-memory-evolution',
      type: PatternType.LEARNING,
      name: 'Knowledge Evolution Pattern',
      description: `Understanding evolves over ${record.avgHoursDiff?.toNumber()?.toFixed(0)}h with ${record.avgCommonWords?.toNumber()?.toFixed(0)} common terms`,
      confidence: 0.7,
      frequency: record.frequency?.toNumber() || 0,
      evidence: [
        {
          type: 'temporal',
          description: `Evolution time: ${record.avgHoursDiff?.toNumber()?.toFixed(0)} hours`,
          weight: 0.4,
          examples: record.examples.map((e: any) => e.m1)
        },
        {
          type: 'semantic',
          description: `Topic overlap: ${record.avgCommonWords?.toNumber()?.toFixed(0)} common words`,
          weight: 0.6,
          examples: record.examples.map((e: any) => e.m2)
        }
      ],
      relationshipType: 'EVOLVED_INTO',
      averageTimeGap: record.avgHoursDiff?.toNumber(),
      metadata: {
        examples: record.examples
      }
    } as MemoryRelationshipPattern))
  }
  
  /**
   * Detect support/contradiction relationships
   */
  private async detectSupportContradictionRelationships(options: any): Promise<MemoryRelationshipPattern[]> {
    // Keywords suggesting agreement/disagreement
    const supportKeywords = ['agree', 'confirm', 'correct', 'yes', 'exactly', 'true']
    const contradictKeywords = ['disagree', 'wrong', 'incorrect', 'no', 'actually', 'but']
    
    const query = `
      // Find memories that support or contradict each other
      MATCH (m1:Memory)
      WHERE m1.content IS NOT NULL
        ${options.projectName ? 'AND m1.project_name = $projectName' : ''}
      
      MATCH (m2:Memory)
      WHERE m2.content IS NOT NULL
        AND m2.project_name = m1.project_name
        AND m2.id <> m1.id
        AND abs(duration.between(datetime(m1.created_at), datetime(m2.created_at)).days) < 30
      
      WITH m1, m2,
           CASE
             WHEN (${supportKeywords.map((k: any) => `toLower(m2.content) CONTAINS '${k}'`).join(' OR ')}) THEN 'supports'
             WHEN (${contradictKeywords.map((k: any) => `toLower(m2.content) CONTAINS '${k}'`).join(' OR ')}) THEN 'contradicts'
             ELSE null
           END as relationshipType
      
      WHERE relationshipType IS NOT NULL
      
      WITH relationshipType,
           COUNT(*) as frequency,
           COLLECT({m1: m1.id, m2: m2.id})[0..5] as examples
      
      WHERE frequency > 3
      RETURN relationshipType, frequency, examples
    `
    
    const result = await neo4jService.executeQuery(query, {
      projectName: options.projectName
    })
    
    return result.records.map((record: any) => ({
      id: `memory-memory-${record.relationshipType}`,
      type: PatternType.LEARNING,
      name: `${record.relationshipType === 'supports' ? 'Support' : 'Contradiction'} Pattern`,
      description: `Memories that ${record.relationshipType} each other`,
      confidence: 0.6,
      frequency: record.frequency?.toNumber() || 0,
      evidence: [
        {
          type: 'semantic',
          description: `${record.relationshipType} relationship detected`,
          weight: 1.0,
          examples: record.examples.map((e: any) => e.m1)
        }
      ],
      relationshipType: record.relationshipType === 'supports' ? 'SUPPORTS' : 'CONTRADICTS',
      metadata: {
        examples: record.examples
      }
    } as MemoryRelationshipPattern))
  }
  
  /**
   * Create the actual relationships
   */
  private async createRelationships(patterns: MemoryRelationshipPattern[]): Promise<void> {
    for (const pattern of patterns) {
      if (pattern.metadata?.examples) {
        const examples = pattern.metadata.examples as any[]
        
        for (const example of examples.slice(0, 3)) { // Limit to avoid too many relationships
          const query = `
            MATCH (m1:Memory {id: $m1})
            MATCH (m2:Memory {id: $m2})
            MERGE (m1)-[r:${pattern.relationshipType}]->(m2)
            SET r.confidence = $confidence,
                r.created_at = datetime(),
                r.pattern_id = $patternId
                ${pattern.averageSimilarity ? ', r.similarity = $similarity' : ''}
                ${pattern.averageTimeGap ? ', r.time_gap_hours = $timeGap' : ''}
            RETURN r
          `
          
          try {
            await neo4jService.executeQuery(query, {
              m1: example.m1,
              m2: example.m2,
              confidence: pattern.confidence,
              similarity: example.similarity || pattern.averageSimilarity,
              timeGap: example.timeDiff || pattern.averageTimeGap,
              patternId: pattern.id
            })
          } catch (error) {
            log.error('Failed to create memory relationship', error, {
              pattern: pattern.id,
              m1: example.m1,
              m2: example.m2
            })
          }
        }
      }
    }
  }
  
  async validatePattern(pattern: Pattern): Promise<{
    stillValid: boolean
    confidenceChange: number
  }> {
    const query = `
      MATCH (m1:Memory)-[r]->(m2:Memory)
      WHERE type(r) IN ['PRECEDED_BY', 'RELATED_TO', 'EVOLVED_INTO', 'CONTRADICTS', 'SUPPORTS']
      RETURN COUNT(r) as count
      LIMIT 1
    `
    
    const result = await neo4jService.executeQuery(query, {})
    const count = result.records[0]?.count?.toNumber() || 0
    
    return {
      stillValid: count > 0,
      confidenceChange: count > pattern.frequency ? 0.1 : -0.1
    }
  }
}