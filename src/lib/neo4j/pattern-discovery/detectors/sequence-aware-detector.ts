/**
 * Sequence-Aware Pattern Detector
 * 
 * Handles the fact that memories are chunked sequences from conversations
 * - Maintains chunk ordering within conversations
 * - Considers context windows across chunks
 * - Builds relationships that respect sequence boundaries
 */

import { neo4jService } from '../../service'
import { log } from '@/lib/logger'
import { Pattern, PatternType, PatternDetector, Evidence } from '../types'
import { embeddingsService } from '@/lib/embeddings/service'

interface SequencePattern extends Pattern {
  sequenceType: 'conversation' | 'session' | 'topic-flow' | 'problem-resolution'
  averageSequenceLength: number
  contextWindowSize: number
}

export class SequenceAwareDetector implements PatternDetector {
  
  async detectPatterns(options: {
    workspaceId?: string
    projectName?: string
    timeRange?: { start: Date, end: Date }
    minConfidence?: number
  } = {}): Promise<SequencePattern[]> {
    log.info('Detecting sequence-aware patterns', options)
    
    const patterns: SequencePattern[] = []
    
    const [
      conversationSequences,
      topicFlowSequences,
      problemResolutionSequences,
      contextWindowPatterns
    ] = await Promise.all([
      this.detectConversationSequences(options),
      this.detectTopicFlowSequences(options),
      this.detectProblemResolutionSequences(options),
      this.detectContextWindowPatterns(options)
    ])
    
    patterns.push(...conversationSequences)
    patterns.push(...topicFlowSequences)
    patterns.push(...problemResolutionSequences)
    patterns.push(...contextWindowPatterns)
    
    // Create sequence relationships
    await this.createSequenceRelationships(patterns.filter(p => p.confidence > 0.7))
    
    return patterns
  }
  
  /**
   * Detect conversation sequences using chunk_id and session_id
   */
  private async detectConversationSequences(options: any): Promise<SequencePattern[]> {
    const query = `
      // Find memories that belong to the same conversation/session
      MATCH (m:Memory)
      WHERE m.chunk_id IS NOT NULL
        ${options.projectName ? 'AND m.project_name = $projectName' : ''}
      
      // Group by session/chunk to find sequences
      WITH m.session_id as sessionId,
           m.chunk_id as chunkId,
           COLLECT(m ORDER BY m.created_at) as sequence
      WHERE SIZE(sequence) > 1
      
      // Analyze sequence characteristics
      WITH sessionId,
           chunkId,
           sequence,
           SIZE(sequence) as sequenceLength,
           duration.between(
             datetime(sequence[0].created_at), 
             datetime(sequence[-1].created_at)
           ).minutes as durationMinutes
      
      // Create chunk relationships
      UNWIND RANGE(0, SIZE(sequence)-2) as i
      WITH sequence[i] as current,
           sequence[i+1] as next,
           sessionId,
           chunkId,
           sequenceLength,
           durationMinutes
      
      // Store sequence relationships
      MERGE (current)-[r:FOLLOWED_BY_IN_CHUNK {
        chunk_id: chunkId,
        session_id: sessionId,
        position_diff: 1
      }]->(next)
      
      WITH sessionId,
           AVG(sequenceLength) as avgSeqLength,
           AVG(durationMinutes) as avgDuration,
           COUNT(DISTINCT chunkId) as chunkCount,
           COLLECT(DISTINCT chunkId)[0..5] as exampleChunks
      
      WHERE chunkCount > 2
      RETURN sessionId, avgSeqLength, avgDuration, chunkCount, exampleChunks
      ORDER BY chunkCount DESC
      LIMIT 20
    `
    
    const result = await neo4jService.executeQuery(query, {
      projectName: options.projectName
    })
    
    return result.records.map((record: any) => ({
      id: `sequence-conversation-${record.sessionId}`,
      type: PatternType.TEMPORAL,
      name: `Conversation Sequence: ${record.sessionId || 'unknown'}`,
      description: `Conversation with ${record.chunkCount?.toNumber()} chunks, avg ${record.avgSeqLength?.toNumber()?.toFixed(0)} memories per chunk`,
      confidence: 0.9, // High confidence for explicit sequences
      frequency: record.chunkCount?.toNumber() || 0,
      evidence: [
        {
          type: 'structural',
          description: `${record.chunkCount?.toNumber()} conversation chunks`,
          weight: 0.5,
          examples: record.exampleChunks
        },
        {
          type: 'temporal',
          description: `Average duration: ${record.avgDuration?.toNumber()?.toFixed(0)} minutes`,
          weight: 0.5,
          examples: []
        }
      ],
      sequenceType: 'conversation',
      averageSequenceLength: record.avgSeqLength?.toNumber() || 0,
      contextWindowSize: 3, // Chunks within a conversation share context
      metadata: {
        sessionId: record.sessionId,
        exampleChunks: record.exampleChunks
      }
    } as SequencePattern))
  }
  
  /**
   * Detect topic flow sequences across chunks
   */
  private async detectTopicFlowSequences(options: any): Promise<SequencePattern[]> {
    const query = `
      // Find how topics flow across chunk boundaries
      MATCH (m1:Memory)-[:FOLLOWED_BY_IN_CHUNK]->(m2:Memory)
      WHERE m1.embedding IS NOT NULL 
        AND m2.embedding IS NOT NULL
        ${options.projectName ? 'AND m1.project_name = $projectName' : ''}
      
      // Check if next chunk continues the topic
      MATCH (m3:Memory)
      WHERE m3.chunk_id <> m2.chunk_id
        AND m3.session_id = m2.session_id
        AND m3.created_at > m2.created_at
        AND m3.created_at < datetime(m2.created_at) + duration({minutes: 30})
        AND m3.embedding IS NOT NULL
      
      WITH m2, m3,
           gds.similarity.cosine(m2.embedding, m3.embedding) as crossChunkSimilarity,
           m2.chunk_id as chunk1,
           m3.chunk_id as chunk2
      WHERE crossChunkSimilarity > 0.7
      
      // Aggregate cross-chunk patterns
      WITH chunk1, chunk2,
           AVG(crossChunkSimilarity) as avgSimilarity,
           COUNT(*) as connectionCount
      WHERE connectionCount > 2
      
      RETURN chunk1, chunk2, avgSimilarity, connectionCount
      ORDER BY avgSimilarity DESC
      LIMIT 20
    `
    
    const result = await neo4jService.executeQuery(query, {
      projectName: options.projectName
    })
    
    return result.records.map((record: any) => ({
      id: `sequence-topic-flow-${record.chunk1}-${record.chunk2}`,
      type: PatternType.LEARNING,
      name: 'Topic Flow Sequence',
      description: `Topics flow between chunks with ${record.avgSimilarity?.toNumber()?.toFixed(3)} similarity`,
      confidence: record.avgSimilarity?.toNumber() || 0,
      frequency: record.connectionCount?.toNumber() || 0,
      evidence: [
        {
          type: 'semantic',
          description: `Cross-chunk similarity: ${record.avgSimilarity?.toNumber()?.toFixed(3)}`,
          weight: 0.8,
          examples: [record.chunk1, record.chunk2]
        },
        {
          type: 'structural',
          description: `${record.connectionCount?.toNumber()} topic continuations`,
          weight: 0.2,
          examples: []
        }
      ],
      sequenceType: 'topic-flow',
      averageSequenceLength: 2, // Connecting two chunks
      contextWindowSize: 2,
      metadata: {
        fromChunk: record.chunk1,
        toChunk: record.chunk2
      }
    } as SequencePattern))
  }
  
  /**
   * Detect problem resolution sequences
   */
  private async detectProblemResolutionSequences(options: any): Promise<SequencePattern[]> {
    const query = `
      // Find problem->investigation->resolution sequences
      MATCH (problem:Memory)
      WHERE (toLower(problem.content) CONTAINS 'error' 
         OR toLower(problem.content) CONTAINS 'problem'
         OR toLower(problem.content) CONTAINS 'issue')
        ${options.projectName ? 'AND problem.project_name = $projectName' : ''}
        AND problem.chunk_id IS NOT NULL
      
      // Find memories in same or subsequent chunks that might be investigation/resolution
      MATCH path = (problem)-[:FOLLOWED_BY_IN_CHUNK*1..10]-(resolution:Memory)
      WHERE (toLower(resolution.content) CONTAINS 'fixed'
         OR toLower(resolution.content) CONTAINS 'solved'
         OR toLower(resolution.content) CONTAINS 'works')
      
      WITH problem, resolution, path,
           length(path) as stepCount,
           [n IN nodes(path) | n.chunk_id] as chunkSequence,
           duration.between(
             datetime(problem.created_at),
             datetime(resolution.created_at)
           ).minutes as resolutionTime
      
      // Group by resolution patterns
      WITH CASE
             WHEN ALL(chunk IN chunkSequence WHERE chunk = problem.chunk_id) THEN 'same-chunk-resolution'
             WHEN SIZE(FILTER(chunk IN chunkSequence WHERE chunk <> problem.chunk_id)) = 1 THEN 'next-chunk-resolution'
             ELSE 'multi-chunk-resolution'
           END as resolutionPattern,
           AVG(stepCount) as avgSteps,
           AVG(resolutionTime) as avgTime,
           COUNT(*) as frequency,
           COLLECT({
             problemId: problem.id,
             resolutionId: resolution.id,
             steps: stepCount,
             chunks: SIZE(FILTER(c IN chunkSequence WHERE c IS NOT NULL))
           })[0..5] as examples
      
      WHERE frequency > 2
      RETURN resolutionPattern, avgSteps, avgTime, frequency, examples
      ORDER BY frequency DESC
    `
    
    const result = await neo4jService.executeQuery(query, {
      projectName: options.projectName
    })
    
    return result.records.map((record: any) => ({
      id: `sequence-resolution-${record.resolutionPattern}`,
      type: PatternType.DEBUGGING,
      name: `Problem Resolution: ${record.resolutionPattern}`,
      description: `Problems resolved in ${record.avgSteps?.toNumber()?.toFixed(1)} steps over ${record.avgTime?.toNumber()?.toFixed(0)} minutes`,
      confidence: 0.8,
      frequency: record.frequency?.toNumber() || 0,
      evidence: [
        {
          type: 'structural',
          description: `Average ${record.avgSteps?.toNumber()?.toFixed(1)} steps to resolution`,
          weight: 0.5,
          examples: record.examples.map((e: any) => e.problemId)
        },
        {
          type: 'temporal',
          description: `Resolution time: ${record.avgTime?.toNumber()?.toFixed(0)} minutes`,
          weight: 0.5,
          examples: record.examples.map((e: any) => e.resolutionId)
        }
      ],
      sequenceType: 'problem-resolution',
      averageSequenceLength: record.avgSteps?.toNumber() || 0,
      contextWindowSize: record.resolutionPattern.includes('multi') ? 5 : 2,
      metadata: {
        resolutionPattern: record.resolutionPattern,
        examples: record.examples
      }
    } as SequencePattern))
  }
  
  /**
   * Detect context window patterns for better embedding generation
   */
  private async detectContextWindowPatterns(options: any): Promise<SequencePattern[]> {
    const query = `
      // Analyze how context spreads across chunks
      MATCH (m1:Memory)
      WHERE m1.chunk_id IS NOT NULL
        AND m1.embedding IS NOT NULL
        ${options.projectName ? 'AND m1.project_name = $projectName' : ''}
      
      // Find memories in nearby chunks
      MATCH (m2:Memory)
      WHERE m2.session_id = m1.session_id
        AND m2.chunk_id <> m1.chunk_id
        AND m2.embedding IS NOT NULL
        AND abs(duration.between(datetime(m1.created_at), datetime(m2.created_at)).minutes) < 30
      
      WITH m1, m2,
           gds.similarity.cosine(m1.embedding, m2.embedding) as similarity,
           abs(duration.between(datetime(m1.created_at), datetime(m2.created_at)).minutes) as timeDiff,
           CASE
             WHEN m1.chunk_id < m2.chunk_id THEN 'forward'
             ELSE 'backward'
           END as direction
      
      // Group by time windows to find optimal context size
      WITH CASE
             WHEN timeDiff < 5 THEN 'immediate-context'
             WHEN timeDiff < 15 THEN 'near-context'
             ELSE 'distant-context'
           END as contextWindow,
           direction,
           AVG(similarity) as avgSimilarity,
           STDEV(similarity) as stdDevSimilarity,
           COUNT(*) as pairCount
      
      WHERE pairCount > 10
      RETURN contextWindow, direction, avgSimilarity, stdDevSimilarity, pairCount
      ORDER BY avgSimilarity DESC
    `
    
    const result = await neo4jService.executeQuery(query, {
      projectName: options.projectName
    })
    
    return result.records.map((record: any) => ({
      id: `sequence-context-${record.contextWindow}-${record.direction}`,
      type: PatternType.ARCHITECTURE,
      name: `Context Window: ${record.contextWindow}`,
      description: `${record.direction} context with ${record.avgSimilarity?.toNumber()?.toFixed(3)} similarity`,
      confidence: record.avgSimilarity?.toNumber() || 0,
      frequency: record.pairCount?.toNumber() || 0,
      evidence: [
        {
          type: 'semantic',
          description: `Context similarity: ${record.avgSimilarity?.toNumber()?.toFixed(3)} (±${record.stdDevSimilarity?.toNumber()?.toFixed(3)})`,
          weight: 1.0,
          examples: []
        }
      ],
      sequenceType: 'session',
      averageSequenceLength: 0,
      contextWindowSize: record.contextWindow === 'immediate-context' ? 1 : 
                        record.contextWindow === 'near-context' ? 3 : 5,
      metadata: {
        contextWindow: record.contextWindow,
        direction: record.direction
      }
    } as SequencePattern))
  }
  
  /**
   * Create sequence-aware relationships
   */
  private async createSequenceRelationships(patterns: SequencePattern[]): Promise<void> {
    // The FOLLOWED_BY_IN_CHUNK relationships are created in the detection queries
    // Here we can create higher-level sequence relationships
    
    for (const pattern of patterns) {
      if (pattern.sequenceType === 'topic-flow' && pattern.metadata?.fromChunk) {
        // Create cross-chunk topic flow relationships
        const query = `
          MATCH (m1:Memory {chunk_id: $fromChunk})
          MATCH (m2:Memory {chunk_id: $toChunk})
          WHERE m1.session_id = m2.session_id
            AND m2.created_at > m1.created_at
          WITH m1, m2
          ORDER BY m1.created_at DESC, m2.created_at ASC
          LIMIT 1
          MERGE (m1)-[r:TOPIC_CONTINUES_TO]->(m2)
          SET r.pattern_id = $patternId,
              r.confidence = $confidence,
              r.created_at = datetime()
          RETURN r
        `
        
        try {
          await neo4jService.executeQuery(query, {
            fromChunk: pattern.metadata.fromChunk,
            toChunk: pattern.metadata.toChunk,
            patternId: pattern.id,
            confidence: pattern.confidence
          })
        } catch (error) {
          log.error('Failed to create topic flow relationship', error)
        }
      }
    }
  }
  
  async validatePattern(pattern: Pattern): Promise<{
    stillValid: boolean
    confidenceChange: number
  }> {
    const query = `
      MATCH ()-[r:FOLLOWED_BY_IN_CHUNK|TOPIC_CONTINUES_TO]->()
      RETURN COUNT(r) as count
      LIMIT 1
    `
    
    const result = await neo4jService.executeQuery(query, {})
    const count = result.records[0]?.count?.toNumber() || 0
    
    return {
      stillValid: count > 0,
      confidenceChange: 0
    }
  }
}

/**
 * Helper to generate context-aware embeddings
 * Considers surrounding chunks for better semantic representation
 */
export async function generateContextAwareEmbedding(
  memory: { content: string, chunk_id?: string, session_id?: string },
  contextSize: number = 2
): Promise<number[]> {
  if (!memory.chunk_id || !memory.session_id) {
    // No context available, generate standard embedding
    return embeddingsService.generateEmbedding(memory.content)
  }
  
  // Fetch context from surrounding chunks
  const query = `
    MATCH (target:Memory {chunk_id: $chunkId, session_id: $sessionId})
    OPTIONAL MATCH (prev:Memory)
    WHERE prev.session_id = $sessionId
      AND prev.created_at < target.created_at
    WITH target, prev
    ORDER BY prev.created_at DESC
    LIMIT $contextSize
    
    OPTIONAL MATCH (next:Memory)  
    WHERE next.session_id = $sessionId
      AND next.created_at > target.created_at
    WITH target, COLLECT(prev.content) as prevContent, next
    ORDER BY next.created_at ASC
    LIMIT $contextSize
    
    RETURN prevContent, target.content as targetContent, COLLECT(next.content) as nextContent
  `
  
  try {
    const result = await neo4jService.executeQuery(query, {
      chunkId: memory.chunk_id,
      sessionId: memory.session_id,
      contextSize
    })
    
    if (result.records.length > 0) {
      const record = result.records[0]
      const prevContent = record.prevContent || []
      const nextContent = record.nextContent || []
      
      // Combine context with markers
      const contextualContent = [
        ...prevContent.map((c: string) => `[PREVIOUS CONTEXT]: ${c.substring(0, 200)}`),
        `[CURRENT]: ${memory.content}`,
        ...nextContent.map((c: string) => `[NEXT CONTEXT]: ${c.substring(0, 200)}`)
      ].join('\n\n')
      
      return embeddingsService.generateEmbedding(contextualContent)
    }
  } catch (error) {
    log.error('Failed to fetch context for embedding', error)
  }
  
  // Fallback to standard embedding
  return embeddingsService.generateEmbedding(memory.content)
}