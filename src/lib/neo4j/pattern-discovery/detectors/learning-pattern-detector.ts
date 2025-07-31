/**
 * Learning Pattern Detector
 * 
 * Discovers patterns in how knowledge is acquired and applied:
 * - Topic progression patterns
 * - Knowledge building sequences
 * - Research-to-implementation patterns
 * - Skill development trajectories
 */

import { neo4jService } from '../../service'
import { log } from '@/lib/logger'
import { Pattern, PatternType, PatternDetector, LearningPattern, Evidence } from '../types'
import { getNumericValue } from '../utils'

export class LearningPatternDetector implements PatternDetector {
  
  // Learning-related keywords
  private readonly learningKeywords = [
    'learn', 'understand', 'study', 'research', 'explore', 'discover',
    'tutorial', 'guide', 'documentation', 'example', 'how to', 'why',
    'concept', 'theory', 'practice', 'implement', 'apply', 'build'
  ]
  
  private readonly researchKeywords = ['research', 'explore', 'study', 'investigate', 'analyze', 'understand']
  private readonly implementKeywords = ['implement', 'build', 'create', 'develop', 'code', 'write']
  
  async detectPatterns(options: {
    workspaceId?: string
    projectName?: string
    timeRange?: { start: Date, end: Date }
    minConfidence?: number
  } = {}): Promise<LearningPattern[]> {
    log.info('Detecting learning patterns', options)
    
    const patterns: LearningPattern[] = []
    
    // Run different learning pattern detections
    const [
      topicProgressionPatterns,
      researchToImplementationPatterns,
      knowledgeBuildingPatterns,
      skillDevelopmentPatterns
    ] = await Promise.all([
      this.detectTopicProgressionPatterns(options),
      this.detectResearchToImplementationPatterns(options),
      this.detectKnowledgeBuildingPatterns(options),
      this.detectSkillDevelopmentPatterns(options)
    ])
    
    patterns.push(...topicProgressionPatterns)
    patterns.push(...researchToImplementationPatterns)
    patterns.push(...knowledgeBuildingPatterns)
    patterns.push(...skillDevelopmentPatterns)
    
    return patterns
  }
  
  /**
   * Detect how topics progress from basic to advanced
   */
  private async detectTopicProgressionPatterns(options: any): Promise<LearningPattern[]> {
    const query = `
      // Use text index for efficient keyword search
      MATCH (m:Memory)
      WHERE m.content =~ '(?i).*(learn|understand|study|research|explore|discover|tutorial|guide|documentation|example|how to|why|concept|theory|practice|implement|apply|build).*'
        ${options.projectName ? 'AND m.project_name = $projectName' : ''}
        AND m.created_at IS NOT NULL
        AND m.embedding IS NOT NULL
      WITH m
      ORDER BY m.created_at
      LIMIT 500  // Avoid memory issues
      
      // Look for patterns in learning progression
      WITH collect(m) as learningMemories
      UNWIND range(0, size(learningMemories)-2) as i
      
      WITH learningMemories[i] as m1, learningMemories[i+1] as m2,
           duration.between(datetime(learningMemories[i].created_at), datetime(learningMemories[i+1].created_at)).hours as hoursApart
      WHERE hoursApart < 48  // Within 2 days
      
      // Group by progression patterns
      WITH CASE
             WHEN hoursApart < 1 THEN 'continuous-learning'
             WHEN hoursApart < 8 THEN 'session-based-learning'
             WHEN hoursApart < 24 THEN 'daily-learning'
             ELSE 'spaced-learning'
           END as progressionType,
           AVG(hoursApart) as avgHoursApart,
           COUNT(*) as frequency
      
      WHERE frequency > 5
      RETURN progressionType, avgHoursApart, frequency
      ORDER BY frequency DESC
    `
    
    const result = await neo4jService.executeQuery(query, {
      projectName: options.projectName
    })
    
    return result.records.map((record: any) => ({
      id: `learning-progression-${record.progressionType}`,
      type: PatternType.LEARNING,
      name: `Learning Progression: ${record.progressionType}`,
      description: `${record.progressionType} pattern with average ${getNumericValue(record.avgHoursApart).toFixed(1)} hours between sessions`,
      confidence: 0.7,
      frequency: getNumericValue(record.frequency),
      evidence: [
        {
          type: 'temporal',
          description: `Average gap: ${getNumericValue(record.avgHoursApart).toFixed(1)} hours`,
          weight: 0.6,
          examples: []
        },
        {
          type: 'outcome',
          description: `Pattern observed ${getNumericValue(record.frequency)} times`,
          weight: 0.4,
          examples: []
        }
      ],
      metadata: {
        progressionType: record.progressionType,
        topics: [],
        skillLevel: 'mixed',
        learningPath: []
      }
    } as LearningPattern))
  }
  
  /**
   * Detect research to implementation patterns
   */
  private async detectResearchToImplementationPatterns(options: any): Promise<LearningPattern[]> {
    const query = `
      // Find research memories using text index
      MATCH (research:Memory)
      WHERE research.content =~ '(?i).*(research|explore|study|investigate|analyze|understand).*'
        ${options.projectName ? 'AND research.project_name = $projectName' : ''}
        AND research.created_at IS NOT NULL
      WITH research
      LIMIT 100  // Limit for performance
      
      // Find implementation memories that follow
      MATCH (implement:Memory)
      WHERE implement.content =~ '(?i).*(implement|build|create|develop|code|write).*'
        AND implement.project_name = research.project_name
        AND datetime(implement.created_at) > datetime(research.created_at)
        AND datetime(implement.created_at) <= datetime(research.created_at) + duration({days: 7})
      WITH research, implement,
           duration.between(datetime(research.created_at), datetime(implement.created_at)).hours as hoursToImplement
      LIMIT 200  // Limit combinations
      
      // Analyze patterns
      WITH CASE
             WHEN hoursToImplement < 24 THEN 'rapid-implementation'
             WHEN hoursToImplement < 72 THEN 'quick-implementation'
             WHEN hoursToImplement < 168 THEN 'standard-implementation'
             ELSE 'delayed-implementation'
           END as implementationSpeed,
           AVG(hoursToImplement) as avgHours,
           COUNT(*) as frequency,
           COLLECT({
             researchId: research.id,
             implementId: implement.id,
             hours: hoursToImplement
           })[0..5] as examples
      
      WHERE frequency > 3
      RETURN implementationSpeed, avgHours, frequency, examples
      ORDER BY frequency DESC
    `
    
    const result = await neo4jService.executeQuery(query, {
      projectName: options.projectName
    })
    
    return result.records.map((record: any) => ({
      id: `learning-research-implement-${record.implementationSpeed}`,
      type: PatternType.LEARNING,
      name: `Research to Implementation: ${record.implementationSpeed}`,
      description: `Research typically leads to implementation within ${getNumericValue(record.avgHours).toFixed(0)} hours`,
      confidence: 0.8,
      frequency: getNumericValue(record.frequency),
      evidence: [
        {
          type: 'temporal',
          description: `Average time to implement: ${getNumericValue(record.avgHours).toFixed(0)} hours`,
          weight: 0.5,
          examples: record.examples?.map((e: any) => e.researchId) || []
        },
        {
          type: 'outcome',
          description: `${getNumericValue(record.frequency)} successful implementations`,
          weight: 0.5,
          examples: record.examples?.map((e: any) => e.implementId) || []
        }
      ],
      metadata: {
        progressionType: 'research-to-implementation',
        topics: [],
        skillLevel: 'intermediate',
        learningPath: ['research', 'understand', 'implement']
      }
    } as LearningPattern))
  }
  
  /**
   * Detect knowledge building patterns using vector similarity
   */
  private async detectKnowledgeBuildingPatterns(options: any): Promise<LearningPattern[]> {
    const query = `
      // Use vector index for semantic similarity
      CALL db.index.vector.queryNodes('memory_embeddings', 20, $sampleEmbedding)
      YIELD node as m1, score
      WHERE m1.content =~ '(?i).*(learn|understand|study|research|explore|discover).*'
        ${options.projectName ? 'AND m1.project_name = $projectName' : ''}
      WITH m1, score
      LIMIT 50
      
      // Find similar learning memories
      CALL db.index.vector.queryNodes('memory_embeddings', 10, m1.embedding)
      YIELD node as m2, score as similarity
      WHERE m2.id <> m1.id
        AND m2.content =~ '(?i).*(learn|understand|study|research|explore|discover).*'
        AND similarity > 0.7
      
      // Identify knowledge building patterns
      WITH COUNT(*) as relatedLearningCount,
           AVG(similarity) as avgSimilarity
      
      RETURN 'knowledge-building' as patternType,
             relatedLearningCount,
             avgSimilarity
    `
    
    // Get a sample embedding for learning content
    const sampleQuery = `
      MATCH (m:Memory)
      WHERE m.content =~ '(?i).*(learn|understand|study).*'
        AND m.embedding IS NOT NULL
      RETURN m.embedding as embedding
      LIMIT 1
    `
    
    const sampleResult = await neo4jService.executeQuery(sampleQuery, {})
    if (sampleResult.records.length === 0) {
      return []
    }
    
    const sampleEmbedding = sampleResult.records[0].embedding
    
    const result = await neo4jService.executeQuery(query, {
      projectName: options.projectName,
      sampleEmbedding
    })
    
    return result.records.map((record: any) => ({
      id: 'learning-knowledge-building',
      type: PatternType.LEARNING,
      name: 'Knowledge Building Pattern',
      description: `Connected learning with ${getNumericValue(record.avgSimilarity).toFixed(3)} average similarity`,
      confidence: getNumericValue(record.avgSimilarity),
      frequency: getNumericValue(record.relatedLearningCount),
      evidence: [
        {
          type: 'semantic',
          description: `High semantic similarity between learning memories`,
          weight: 1.0,
          examples: []
        }
      ],
      metadata: {
        progressionType: 'knowledge-building',
        topics: [],
        skillLevel: 'progressive',
        learningPath: []
      }
    } as LearningPattern))
  }
  
  /**
   * Detect skill development patterns
   */
  private async detectSkillDevelopmentPatterns(options: any): Promise<LearningPattern[]> {
    const query = `
      // Track skill development over time
      MATCH (m:Memory)
      WHERE m.content =~ '(?i).*(learn|understand|study|research|explore|discover|tutorial|guide|documentation|example|how to|why|concept|theory|practice|implement|apply|build).*'
        ${options.projectName ? 'AND m.project_name = $projectName' : ''}
        AND m.created_at IS NOT NULL
      
      WITH m, date(datetime(m.created_at)) as learningDate
      
      // Group by time periods to see skill progression
      WITH learningDate,
           COUNT(*) as learningActivity
      ORDER BY learningDate
      
      // Calculate learning intensity over time
      WITH collect({date: learningDate, activity: learningActivity}) as timeline
      WHERE size(timeline) > 7  // At least a week of data
      
      RETURN 'skill-development' as patternType,
             size(timeline) as daysOfLearning,
             reduce(total = 0, item IN timeline | total + item.activity) as totalLearningMemories
    `
    
    const result = await neo4jService.executeQuery(query, {
      projectName: options.projectName
    })
    
    return result.records.map((record: any) => ({
      id: 'learning-skill-development',
      type: PatternType.LEARNING,
      name: 'Skill Development Pattern',
      description: `Sustained learning over ${getNumericValue(record.daysOfLearning)} days with ${getNumericValue(record.totalLearningMemories)} learning activities`,
      confidence: Math.min(getNumericValue(record.daysOfLearning) / 30, 1), // More days = higher confidence
      frequency: getNumericValue(record.totalLearningMemories),
      evidence: [
        {
          type: 'temporal',
          description: `${getNumericValue(record.daysOfLearning)} days of learning activity`,
          weight: 0.5,
          examples: []
        },
        {
          type: 'outcome',
          description: `${getNumericValue(record.totalLearningMemories)} total learning memories`,
          weight: 0.5,
          examples: []
        }
      ],
      metadata: {
        progressionType: 'skill-development',
        topics: [],
        skillLevel: 'developing',
        learningPath: []
      }
    } as LearningPattern))
  }
  
  async validatePattern(pattern: Pattern): Promise<{
    stillValid: boolean
    confidenceChange: number
  }> {
    // Check if learning patterns still exist
    const query = `
      MATCH (m:Memory)
      WHERE m.content =~ '(?i).*(learn|understand|study|research|explore|discover).*'
      RETURN COUNT(*) as learningMemories
      LIMIT 1
    `
    
    const result = await neo4jService.executeQuery(query, {})
    const count = getNumericValue(result.records[0]?.learningMemories)
    
    return {
      stillValid: count > pattern.frequency * 0.5,
      confidenceChange: count > pattern.frequency ? 0.1 : -0.1
    }
  }
}