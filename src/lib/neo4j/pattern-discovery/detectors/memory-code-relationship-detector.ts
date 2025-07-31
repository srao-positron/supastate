/**
 * Memory-Code Relationship Detector
 * 
 * Discovers relationships between memories and code using:
 * - Semantic similarity (embeddings)
 * - Temporal proximity
 * - Project context
 * - Content analysis
 */

import { neo4jService } from '../../service'
import { log } from '@/lib/logger'
import { Pattern, PatternType, PatternDetector, Evidence } from '../types'
import { getNumericValue } from '../utils'

interface MemoryCodeRelationshipPattern extends Pattern {
  relationshipType: 'DISCUSSES' | 'REFERENCES_CODE' | 'DEBUGS' | 'DOCUMENTS' | 'MODIFIES'
  averageSimilarity: number
  codeEntityTypes: string[]
}

export class MemoryCodeRelationshipDetector implements PatternDetector {
  
  async detectPatterns(options: {
    workspaceId?: string
    projectName?: string
    timeRange?: { start: Date, end: Date }
    minConfidence?: number
    similarityThreshold?: number
  } = {}): Promise<MemoryCodeRelationshipPattern[]> {
    log.info('Detecting memory-code relationships', options)
    
    const patterns: MemoryCodeRelationshipPattern[] = []
    const similarityThreshold = options.similarityThreshold || 0.7
    
    // Create relationships and detect patterns
    const [
      semanticRelationships,
      temporalRelationships,
      debuggingRelationships,
      documentationRelationships
    ] = await Promise.all([
      this.detectSemanticRelationships(options, similarityThreshold),
      this.detectTemporalCodeRelationships(options),
      this.detectDebuggingCodeRelationships(options),
      this.detectDocumentationRelationships(options)
    ])
    
    patterns.push(...semanticRelationships)
    patterns.push(...temporalRelationships)
    patterns.push(...debuggingRelationships)
    patterns.push(...documentationRelationships)
    
    // Actually create the high-confidence relationships
    await this.createRelationships(patterns.filter(p => p.confidence > 0.7))
    
    return patterns
  }
  
  /**
   * Detect relationships using semantic similarity between memory and code embeddings
   */
  private async detectSemanticRelationships(
    options: any, 
    similarityThreshold: number
  ): Promise<MemoryCodeRelationshipPattern[]> {
    const query = `
      // First check if we have embeddings
      MATCH (m:Memory)
      WHERE m.embedding IS NOT NULL
      RETURN COUNT(m) as memoryCount
      LIMIT 1
    `
    
    const checkResult = await neo4jService.executeQuery(query, {})
    const memoryCount = getNumericValue(checkResult.records[0]?.memoryCount)
    
    if (memoryCount === 0) {
      log.warn('No memory embeddings found. Skipping semantic relationship detection.')
      return []
    }
    
    // Now do the actual pattern detection
    const patternQuery = `
      // Sample memories and code entities that share projects
      MATCH (m:Memory)
      WHERE m.embedding IS NOT NULL
        AND m.project_name IS NOT NULL
        ${options.projectName ? 'AND m.project_name = $projectName' : ''}
      WITH m LIMIT 100  // Start small to avoid timeouts
      
      MATCH (c:CodeEntity)
      WHERE c.embedding IS NOT NULL
        AND c.project_name = m.project_name
      WITH m, c LIMIT 500  // Limit combinations
      
      // Calculate cosine similarity
      WITH m, c,
           gds.similarity.cosine(m.embedding, c.embedding) as similarity
      WHERE similarity > $similarityThreshold
      
      // Group by similarity ranges and code types
      WITH CASE
             WHEN similarity > 0.9 THEN 'very-high-similarity'
             WHEN similarity > 0.8 THEN 'high-similarity'
             ELSE 'moderate-similarity'
           END as similarityLevel,
           c.type as codeType,
           AVG(similarity) as avgSimilarity,
           COUNT(*) as frequency,
           COLLECT({
             memoryId: m.id,
             codeId: c.id,
             codeName: c.name,
             codeType: c.type,
             similarity: similarity
           })[0..10] as examples
      
      WHERE frequency > 5
      RETURN similarityLevel, codeType, avgSimilarity, frequency, examples
      ORDER BY avgSimilarity DESC
    `
    
    const result = await neo4jService.executeQuery(patternQuery, {
      projectName: options.projectName,
      similarityThreshold
    })
    
    return result.records.map((record: any) => ({
      id: `memory-code-semantic-${record.similarityLevel}-${record.codeType}`,
      type: PatternType.ARCHITECTURE,
      name: `Semantic Relationship: Memory-${record.codeType}`,
      description: `Memories show ${record.similarityLevel} with ${record.codeType} entities (avg similarity: ${getNumericValue(record.avgSimilarity).toFixed(3)})`,
      confidence: getNumericValue(record.avgSimilarity) * 0.8,
      frequency: getNumericValue(record.frequency),
      evidence: [
        {
          type: 'semantic',
          description: `Average cosine similarity: ${getNumericValue(record.avgSimilarity).toFixed(3)}`,
          weight: 0.7,
          examples: record.examples.map((e: any) => e.memoryId)
        },
        {
          type: 'structural',
          description: `${getNumericValue(record.frequency)} memory-code pairs found`,
          weight: 0.3,
          examples: record.examples.map((e: any) => e.codeId)
        }
      ],
      relationshipType: 'DISCUSSES',
      averageSimilarity: getNumericValue(record.avgSimilarity),
      codeEntityTypes: [record.codeType],
      metadata: {
        similarityLevel: record.similarityLevel,
        examples: record.examples
      }
    } as MemoryCodeRelationshipPattern))
  }
  
  /**
   * Detect temporal relationships (memories created near code changes)
   */
  private async detectTemporalCodeRelationships(options: any): Promise<MemoryCodeRelationshipPattern[]> {
    const query = `
      // Find memories and code entities created around the same time
      MATCH (m:Memory)
      WHERE m.created_at IS NOT NULL
        AND m.project_name IS NOT NULL
        ${options.projectName ? 'AND m.project_name = $projectName' : ''}
      
      MATCH (c:CodeEntity)
      WHERE c.created_at IS NOT NULL
        AND c.project_name = m.project_name
        AND abs(duration.between(datetime(m.created_at), datetime(c.created_at)).hours) < 24
      
      WITH m, c,
           duration.between(datetime(m.created_at), datetime(c.created_at)).hours as timeDiff
      
      WITH CASE
             WHEN abs(timeDiff) < 1 THEN 'concurrent'
             WHEN timeDiff > 0 THEN 'memory-after-code'
             ELSE 'code-after-memory'
           END as temporalPattern,
           c.type as codeType,
           AVG(abs(timeDiff)) as avgTimeDiff,
           COUNT(*) as frequency,
           COLLECT({
             memoryId: m.id,
             codeId: c.id,
             codeName: c.name,
             timeDiff: timeDiff
           })[0..10] as examples
      
      WHERE frequency > 3
      RETURN temporalPattern, codeType, avgTimeDiff, frequency, examples
      ORDER BY frequency DESC
    `
    
    const result = await neo4jService.executeQuery(query, {
      projectName: options.projectName
    })
    
    return result.records.map((record: any) => {
      const pattern = record.temporalPattern
      const relationshipType = pattern === 'memory-after-code' ? 'DOCUMENTS' : 
                              pattern === 'code-after-memory' ? 'MODIFIES' : 
                              'REFERENCES_CODE'
      
      return {
        id: `memory-code-temporal-${pattern}-${record.codeType}`,
        type: PatternType.TEMPORAL,
        name: `Temporal Relationship: ${pattern}`,
        description: `${pattern} pattern observed between memories and ${record.codeType} (avg ${getNumericValue(record.avgTimeDiff).toFixed(1)}h apart)`,
        confidence: 0.6,
        frequency: getNumericValue(record.frequency),
        evidence: [
          {
            type: 'temporal',
            description: `Average time difference: ${getNumericValue(record.avgTimeDiff).toFixed(1)} hours`,
            weight: 0.8,
            examples: record.examples.map((e: any) => e.memoryId)
          },
          {
            type: 'outcome',
            description: `Pattern observed ${getNumericValue(record.frequency)} times`,
            weight: 0.2,
            examples: record.examples.map((e: any) => e.codeId)
          }
        ],
        relationshipType: relationshipType as any,
        averageSimilarity: 0,
        codeEntityTypes: [record.codeType],
        metadata: {
          temporalPattern: pattern,
          avgTimeDiff: getNumericValue(record.avgTimeDiff)
        }
      } as MemoryCodeRelationshipPattern
    })
  }
  
  /**
   * Detect debugging relationships
   */
  private async detectDebuggingCodeRelationships(options: any): Promise<MemoryCodeRelationshipPattern[]> {
    const debugKeywords = ['error', 'bug', 'fix', 'debug', 'issue', 'problem', 'resolve']
    
    const query = `
      // Find debugging memories
      MATCH (m:Memory)
      WHERE (${debugKeywords.map((k: any) => `toLower(m.content) CONTAINS '${k}'`).join(' OR ')})
        AND m.project_name IS NOT NULL
        ${options.projectName ? 'AND m.project_name = $projectName' : ''}
        AND m.embedding IS NOT NULL
      
      // Find potentially related code
      MATCH (c:CodeEntity)
      WHERE c.project_name = m.project_name
        AND c.embedding IS NOT NULL
      
      WITH m, c,
           gds.similarity.cosine(m.embedding, c.embedding) as similarity
      WHERE similarity > 0.6
      
      // Additional check: memory should mention code entity name or file
      WITH m, c, similarity
      WHERE toLower(m.content) CONTAINS toLower(c.name)
         OR (c.file_path IS NOT NULL AND toLower(m.content) CONTAINS toLower(c.file_path))
      
      WITH c.type as codeType,
           AVG(similarity) as avgSimilarity,
           COUNT(*) as frequency,
           COLLECT({
             memoryId: m.id,
             codeId: c.id,
             codeName: c.name,
             similarity: similarity
           })[0..10] as examples
      
      WHERE frequency > 2
      RETURN codeType, avgSimilarity, frequency, examples
      ORDER BY frequency DESC
    `
    
    const result = await neo4jService.executeQuery(query, {
      projectName: options.projectName
    })
    
    return result.records.map((record: any) => ({
      id: `memory-code-debugging-${record.codeType}`,
      type: PatternType.DEBUGGING,
      name: `Debugging Relationship: ${record.codeType}`,
      description: `Debugging memories frequently reference ${record.codeType} entities`,
      confidence: 0.8,
      frequency: record.frequency?.toNumber() || 0,
      evidence: [
        {
          type: 'semantic',
          description: `Debugging context with ${getNumericValue(record.avgSimilarity).toFixed(3)} similarity`,
          weight: 0.5,
          examples: record.examples.map((e: any) => e.memoryId)
        },
        {
          type: 'structural',
          description: `Direct code references found`,
          weight: 0.5,
          examples: record.examples.map((e: any) => e.codeId)
        }
      ],
      relationshipType: 'DEBUGS',
      averageSimilarity: getNumericValue(record.avgSimilarity),
      codeEntityTypes: [record.codeType],
      metadata: {
        debuggingContext: true
      }
    } as MemoryCodeRelationshipPattern))
  }
  
  /**
   * Detect documentation relationships
   */
  private async detectDocumentationRelationships(options: any): Promise<MemoryCodeRelationshipPattern[]> {
    const docKeywords = ['explain', 'describe', 'document', 'how', 'why', 'what', 'understand', 'overview']
    
    const query = `
      // Find documentation-style memories
      MATCH (m:Memory)
      WHERE (${docKeywords.map((k: any) => `toLower(m.content) CONTAINS '${k}'`).join(' OR ')})
        AND m.project_name IS NOT NULL
        ${options.projectName ? 'AND m.project_name = $projectName' : ''}
        AND m.embedding IS NOT NULL
        AND size(m.content) > 200  // Documentation tends to be longer
      
      // Find related code
      MATCH (c:CodeEntity)
      WHERE c.project_name = m.project_name
        AND c.embedding IS NOT NULL
        AND c.type IN ['class', 'interface', 'function', 'method']  // Main code structures
      
      WITH m, c,
           gds.similarity.cosine(m.embedding, c.embedding) as similarity
      WHERE similarity > 0.75  // Higher threshold for documentation
      
      WITH c.type as codeType,
           AVG(similarity) as avgSimilarity,
           COUNT(*) as frequency,
           COLLECT({
             memoryId: m.id,
             codeId: c.id,
             codeName: c.name,
             similarity: similarity
           })[0..10] as examples
      
      WHERE frequency > 2
      RETURN codeType, avgSimilarity, frequency, examples
      ORDER BY avgSimilarity DESC
    `
    
    const result = await neo4jService.executeQuery(query, {
      projectName: options.projectName
    })
    
    return result.records.map((record: any) => ({
      id: `memory-code-documentation-${record.codeType}`,
      type: PatternType.ARCHITECTURE,
      name: `Documentation Relationship: ${record.codeType}`,
      description: `Documentation memories for ${record.codeType} entities`,
      confidence: getNumericValue(record.avgSimilarity),
      frequency: record.frequency?.toNumber() || 0,
      evidence: [
        {
          type: 'semantic',
          description: `High semantic similarity: ${getNumericValue(record.avgSimilarity).toFixed(3)}`,
          weight: 0.8,
          examples: record.examples.map((e: any) => e.memoryId)
        },
        {
          type: 'structural',
          description: `Documentation pattern detected`,
          weight: 0.2,
          examples: record.examples.map((e: any) => e.codeId)
        }
      ],
      relationshipType: 'DOCUMENTS',
      averageSimilarity: getNumericValue(record.avgSimilarity),
      codeEntityTypes: [record.codeType],
      metadata: {
        documentationType: 'explanation'
      }
    } as MemoryCodeRelationshipPattern))
  }
  
  /**
   * Actually create the relationships in Neo4j
   */
  private async createRelationships(patterns: MemoryCodeRelationshipPattern[]): Promise<void> {
    for (const pattern of patterns) {
      if (pattern.metadata?.examples) {
        const examples = pattern.metadata.examples as any[]
        
        // Create relationships for high-confidence examples
        for (const example of examples.slice(0, 5)) {
          if (example.similarity > 0.8 || pattern.relationshipType === 'DEBUGS') {
            const query = `
              MATCH (m:Memory {id: $memoryId})
              MATCH (c:CodeEntity {id: $codeId})
              MERGE (m)-[r:${pattern.relationshipType}]->(c)
              SET r.confidence = $confidence,
                  r.similarity = $similarity,
                  r.created_at = datetime(),
                  r.pattern_id = $patternId
              RETURN r
            `
            
            try {
              await neo4jService.executeQuery(query, {
                memoryId: example.memoryId,
                codeId: example.codeId,
                confidence: pattern.confidence,
                similarity: example.similarity || 0,
                patternId: pattern.id
              })
            } catch (error) {
              log.error('Failed to create relationship', error, {
                pattern: pattern.id,
                memory: example.memoryId,
                code: example.codeId
              })
            }
          }
        }
      }
    }
  }
  
  async validatePattern(pattern: Pattern): Promise<{
    stillValid: boolean
    confidenceChange: number
  }> {
    // Validate by checking if similar relationships still exist
    const query = `
      MATCH (m:Memory)-[r]->(c:CodeEntity)
      WHERE type(r) IN ['DISCUSSES', 'REFERENCES_CODE', 'DEBUGS', 'DOCUMENTS', 'MODIFIES']
      RETURN COUNT(r) as relationshipCount
      LIMIT 1
    `
    
    const result = await neo4jService.executeQuery(query, {})
    const count = getNumericValue(result.records[0]?.relationshipCount)
    
    return {
      stillValid: count > 0,
      confidenceChange: count > pattern.frequency ? 0.1 : -0.1
    }
  }
}