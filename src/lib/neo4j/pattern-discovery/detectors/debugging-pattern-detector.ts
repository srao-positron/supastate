/**
 * Debugging Pattern Detector
 * 
 * Discovers patterns in how problems are identified and resolved:
 * - Problem to solution patterns
 * - Investigation sequences
 * - Resolution time patterns
 * - Common debugging workflows
 */

import { neo4jService } from '../../service'
import { log } from '@/lib/logger'
import { Pattern, PatternType, PatternDetector, DebuggingPattern, Evidence } from '../types'
import { getNumericValue } from '../utils'

export class DebuggingPatternDetector implements PatternDetector {
  
  // Common debugging-related keywords (language agnostic)
  private readonly debugKeywords = [
    'error', 'bug', 'issue', 'problem', 'fix', 'debug', 'resolve', 
    'crash', 'fail', 'broken', 'exception', 'trace', 'investigate',
    'solution', 'workaround', 'patch', 'solved', 'fixed', 'resolved'
  ]
  
  private readonly problemKeywords = ['error', 'bug', 'issue', 'problem', 'crash', 'fail', 'broken', 'exception']
  private readonly solutionKeywords = ['fix', 'resolve', 'solution', 'solved', 'fixed', 'resolved', 'patch', 'workaround']
  
  async detectPatterns(options: {
    workspaceId?: string
    projectName?: string
    timeRange?: { start: Date, end: Date }
    minConfidence?: number
  } = {}): Promise<DebuggingPattern[]> {
    log.info('Detecting debugging patterns', options)
    
    const patterns: DebuggingPattern[] = []
    
    const [
      problemResolutionPatterns,
      investigationPatterns,
      resolutionTimePatterns,
      debuggingWorkflows
    ] = await Promise.all([
      this.detectProblemResolutionPatterns(options),
      this.detectInvestigationPatterns(options),
      this.detectResolutionTimePatterns(options),
      this.detectDebuggingWorkflows(options)
    ])
    
    patterns.push(...problemResolutionPatterns)
    patterns.push(...investigationPatterns)
    patterns.push(...resolutionTimePatterns)
    patterns.push(...debuggingWorkflows)
    
    return patterns
  }
  
  /**
   * Detect problem to resolution patterns
   */
  private async detectProblemResolutionPatterns(options: any): Promise<DebuggingPattern[]> {
    const query = `
      // Find memories that mention problems
      MATCH (problem:Memory)
      WHERE ${this.buildKeywordCondition('problem.content', this.problemKeywords)}
        ${options.projectName ? 'AND problem.project_name = $projectName' : ''}
        AND problem.created_at IS NOT NULL
      WITH problem
      LIMIT 100  // Limit to avoid memory issues
      
      // Find potential solutions that came after
      MATCH (solution:Memory)
      WHERE ${this.buildKeywordCondition('solution.content', this.solutionKeywords)}
        AND solution.project_name = problem.project_name
        AND datetime(solution.created_at) > datetime(problem.created_at)
        AND datetime(solution.created_at) <= datetime(problem.created_at) + duration({hours: 24})
      WITH problem, solution
      LIMIT 500  // Limit combinations
      
      WITH problem, solution,
           duration.between(datetime(problem.created_at), datetime(solution.created_at)).minutes as resolutionTime
      
      // Group by resolution time patterns
      WITH CASE
             WHEN resolutionTime < 30 THEN 'quick-resolution'
             WHEN resolutionTime < 120 THEN 'moderate-resolution'
             WHEN resolutionTime < 480 THEN 'extended-resolution'
             ELSE 'long-resolution'
           END as resolutionPattern,
           AVG(resolutionTime) as avgResolutionTime,
           STDEV(resolutionTime) as stdDevResolutionTime,
           COUNT(*) as frequency,
           COLLECT({
             problemId: problem.id,
             solutionId: solution.id,
             time: resolutionTime,
             project: problem.project_name
           })[0..10] as examples
      
      WHERE frequency > 2
      RETURN resolutionPattern, avgResolutionTime, stdDevResolutionTime, frequency, examples
      ORDER BY frequency DESC
    `
    
    const result = await neo4jService.executeQuery(query, {
      projectName: options.projectName
    })
    
    return result.records.map((record: any) => {
      const avgTime = getNumericValue(record.avgResolutionTime)
      const stdDev = getNumericValue(record.stdDevResolutionTime)
      const freq = getNumericValue(record.frequency)
      
      return {
        id: `debugging-resolution-${record.resolutionPattern}`,
        type: PatternType.DEBUGGING,
        name: `Resolution Pattern: ${record.resolutionPattern}`,
        description: `Problems typically resolved in ${avgTime.toFixed(0)}±${stdDev.toFixed(0)} minutes`,
        confidence: this.calculateConfidence(freq, avgTime, stdDev),
        frequency: freq,
        evidence: [
          {
            type: 'temporal',
            description: `Average resolution time: ${this.formatDuration(avgTime)}`,
            weight: 0.4,
            examples: record.examples.map((e: any) => e.problemId)
          },
          {
            type: 'outcome',
            description: `${freq} successful resolutions observed`,
            weight: 0.6,
            examples: record.examples.map((e: any) => e.solutionId)
          }
        ],
        metadata: {
          problemType: 'general',
          solutionType: 'general',
          averageResolutionTime: avgTime,
          successRate: 1.0, // All matched patterns are successful
          commonSteps: []
        }
      } as DebuggingPattern
    })
  }
  
  /**
   * Detect investigation patterns
   */
  private async detectInvestigationPatterns(options: any): Promise<DebuggingPattern[]> {
    const query = `
      // Find sequences of debugging-related memories
      MATCH path = (m1:Memory)-[:PRECEDED_BY*1..5]->(m2:Memory)
      WHERE ALL(m IN nodes(path) WHERE ${this.buildKeywordCondition('m.content', this.debugKeywords)})
        ${options.projectName ? 'AND m1.project_name = $projectName' : ''}
        AND m1.created_at IS NOT NULL
        AND m2.created_at IS NOT NULL
      
      WITH path,
           length(path) as investigationDepth,
           [m IN nodes(path) | m.id] as memorySequence,
           duration.between(
             datetime(nodes(path)[-1].created_at), 
             datetime(nodes(path)[0].created_at)
           ).minutes as totalTime
      
      WITH CASE
             WHEN investigationDepth = 1 THEN 'direct-investigation'
             WHEN investigationDepth <= 3 THEN 'moderate-investigation'
             ELSE 'deep-investigation'
           END as investigationType,
           AVG(investigationDepth) as avgDepth,
           AVG(totalTime) as avgTime,
           COUNT(*) as frequency,
           COLLECT({
             depth: investigationDepth,
             time: totalTime,
             sequence: memorySequence[0..3]
           })[0..5] as examples
      
      WHERE frequency > 2
      RETURN investigationType, avgDepth, avgTime, frequency, examples
      ORDER BY frequency DESC
    `
    
    const result = await neo4jService.executeQuery(query, {
      projectName: options.projectName
    })
    
    return result.records.map((record: any) => ({
      id: `debugging-investigation-${record.investigationType}`,
      type: PatternType.DEBUGGING,
      name: `Investigation Pattern: ${record.investigationType}`,
      description: `Debugging investigations typically involve ${getNumericValue(record.avgDepth).toFixed(1)} steps over ${getNumericValue(record.avgTime).toFixed(0)} minutes`,
      confidence: 0.7,
      frequency: getNumericValue(record.frequency),
      evidence: [
        {
          type: 'structural',
          description: `Average investigation depth: ${getNumericValue(record.avgDepth).toFixed(1)} steps`,
          weight: 0.5,
          examples: record.examples.flatMap((e: any) => e.sequence || [])
        },
        {
          type: 'temporal',
          description: `Average time: ${this.formatDuration(getNumericValue(record.avgTime))}`,
          weight: 0.5,
          examples: []
        }
      ],
      metadata: {
        problemType: 'investigation',
        solutionType: 'discovery',
        averageResolutionTime: getNumericValue(record.avgTime),
        successRate: 0.8,
        commonSteps: [record.investigationType]
      }
    } as DebuggingPattern))
  }
  
  /**
   * Detect resolution time patterns by problem type
   */
  private async detectResolutionTimePatterns(options: any): Promise<DebuggingPattern[]> {
    const query = `
      // Analyze resolution times for different types of problems
      MATCH (m:Memory)
      WHERE ${this.buildKeywordCondition('m.content', this.debugKeywords)}
        ${options.projectName ? 'AND m.project_name = $projectName' : ''}
        AND m.created_at IS NOT NULL
      
      // Look for resolution patterns within the same day
      WITH m, 
           date(datetime(m.created_at)) as debugDay,
           datetime(m.created_at).hour as debugHour
      
      WITH debugDay,
           COUNT(DISTINCT debugHour) as activeHours,
           COUNT(*) as debuggingMemories,
           MIN(debugHour) as startHour,
           MAX(debugHour) as endHour
      
      WHERE debuggingMemories > 5
      
      WITH CASE
             WHEN activeHours <= 2 THEN 'focused-debugging'
             WHEN activeHours <= 4 THEN 'moderate-debugging'
             ELSE 'extended-debugging'
           END as debuggingIntensity,
           AVG(activeHours) as avgActiveHours,
           AVG(debuggingMemories) as avgMemories,
           COUNT(*) as frequency
      
      WHERE frequency > 2
      RETURN debuggingIntensity, avgActiveHours, avgMemories, frequency
      ORDER BY frequency DESC
    `
    
    const result = await neo4jService.executeQuery(query, {
      projectName: options.projectName
    })
    
    return result.records.map((record: any) => ({
      id: `debugging-intensity-${record.debuggingIntensity}`,
      type: PatternType.DEBUGGING,
      name: `Debugging Intensity: ${record.debuggingIntensity}`,
      description: `Debugging sessions typically span ${getNumericValue(record.avgActiveHours).toFixed(1)} hours with ${getNumericValue(record.avgMemories).toFixed(0)} related memories`,
      confidence: 0.6,
      frequency: getNumericValue(record.frequency),
      evidence: [
        {
          type: 'temporal',
          description: `Average active hours: ${getNumericValue(record.avgActiveHours).toFixed(1)}`,
          weight: 0.5,
          examples: []
        },
        {
          type: 'structural',
          description: `Average memories per session: ${getNumericValue(record.avgMemories).toFixed(0)}`,
          weight: 0.5,
          examples: []
        }
      ],
      metadata: {
        problemType: 'various',
        solutionType: 'various',
        averageResolutionTime: getNumericValue(record.avgActiveHours) * 60,
        successRate: 0.7,
        commonSteps: []
      }
    } as DebuggingPattern))
  }
  
  /**
   * Detect common debugging workflows
   */
  private async detectDebuggingWorkflows(options: any): Promise<DebuggingPattern[]> {
    const query = `
      // Find clusters of debugging-related memories
      MATCH (m:Memory)
      WHERE ${this.buildKeywordCondition('m.content', this.debugKeywords)}
        ${options.projectName ? 'AND m.project_name = $projectName' : ''}
        AND m.created_at IS NOT NULL
      
      // Find other debugging memories within 2 hours
      MATCH (related:Memory)
      WHERE ${this.buildKeywordCondition('related.content', this.debugKeywords)}
        AND related.project_name = m.project_name
        AND related.id <> m.id
        AND abs(duration.between(datetime(m.created_at), datetime(related.created_at)).minutes) < 120
      
      WITH m, COUNT(related) as clusterSize, COLLECT(related.id)[0..5] as relatedIds
      WHERE clusterSize > 3
      
      WITH AVG(clusterSize) as avgClusterSize,
           STDEV(clusterSize) as stdDevClusterSize,
           COUNT(*) as frequency
      
      WHERE frequency > 5
      RETURN avgClusterSize, stdDevClusterSize, frequency
    `
    
    const result = await neo4jService.executeQuery(query, {
      projectName: options.projectName
    })
    
    return result.records.map((record: any) => {
      const avgSize = getNumericValue(record.avgClusterSize)
      const stdDev = getNumericValue(record.stdDevClusterSize)
      
      return {
        id: 'debugging-workflow-cluster',
        type: PatternType.DEBUGGING,
        name: 'Debugging Workflow: Collaborative Investigation',
        description: `Debugging typically involves clusters of ${avgSize.toFixed(0)}±${stdDev.toFixed(0)} related memories`,
        confidence: 0.7,
        frequency: getNumericValue(record.frequency),
        evidence: [
          {
            type: 'structural',
            description: `Average cluster size: ${avgSize.toFixed(0)} memories`,
            weight: 1.0,
            examples: []
          }
        ],
        metadata: {
          problemType: 'complex',
          solutionType: 'collaborative',
          averageResolutionTime: 120,
          successRate: 0.8,
          commonSteps: ['identify', 'investigate', 'test', 'resolve']
        }
      } as DebuggingPattern
    })
  }
  
  async validatePattern(pattern: Pattern): Promise<{
    stillValid: boolean
    confidenceChange: number
  }> {
    // Simple validation - check if debugging patterns still exist
    const query = `
      MATCH (m:Memory)
      WHERE ${this.buildKeywordCondition('m.content', this.debugKeywords)}
      RETURN COUNT(*) as debuggingMemories
      LIMIT 1
    `
    
    const result = await neo4jService.executeQuery(query, {})
    const count = getNumericValue(result.records[0]?.debuggingMemories)
    
    return {
      stillValid: count > pattern.frequency * 0.5,
      confidenceChange: count > pattern.frequency ? 0.1 : -0.1
    }
  }
  
  /**
   * Build Neo4j condition for keyword matching
   */
  private buildKeywordCondition(field: string, keywords: string[]): string {
    return keywords
      .map((keyword: any) => `toLower(${field}) CONTAINS '${keyword}'`)
      .join(' OR ')
  }
  
  /**
   * Calculate confidence based on frequency and consistency
   */
  private calculateConfidence(frequency: number, avgTime: number, stdDev: number): number {
    const freqScore = Math.min(Math.log10(frequency + 1) / 2, 1)
    const consistencyScore = stdDev > 0 ? 1 / (1 + stdDev / avgTime) : 1
    const timeScore = avgTime < 60 ? 0.8 : avgTime < 240 ? 0.6 : 0.4
    
    return freqScore * 0.4 + consistencyScore * 0.3 + timeScore * 0.3
  }
  
  /**
   * Format duration in human-readable form
   */
  private formatDuration(minutes: number): string {
    if (minutes < 60) return `${minutes.toFixed(0)} minutes`
    if (minutes < 1440) return `${(minutes / 60).toFixed(1)} hours`
    return `${(minutes / 1440).toFixed(1)} days`
  }
}