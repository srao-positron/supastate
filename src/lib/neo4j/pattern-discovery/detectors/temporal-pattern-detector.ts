/**
 * Temporal Pattern Detector
 * 
 * Discovers patterns in how memories flow over time:
 * - Sequential work patterns
 * - Time-based clusters
 * - Session patterns
 * - Work rhythm patterns
 */

import { neo4jService } from '../../service'
import { log } from '@/lib/logger'
import { Pattern, PatternType, PatternDetector, TemporalPattern, Evidence } from '../types'
import { getNumericValue } from '../utils'

export class TemporalPatternDetector implements PatternDetector {
  
  async detectPatterns(options: {
    workspaceId?: string
    projectName?: string
    timeRange?: { start: Date, end: Date }
    minConfidence?: number
  } = {}): Promise<TemporalPattern[]> {
    log.info('Detecting temporal patterns', options)
    
    const patterns: TemporalPattern[] = []
    
    // Run different temporal pattern detections
    const [
      sequentialPatterns,
      sessionPatterns,
      rhythmPatterns,
      burstPatterns
    ] = await Promise.all([
      this.detectSequentialPatterns(options),
      this.detectSessionPatterns(options),
      this.detectWorkRhythmPatterns(options),
      this.detectBurstPatterns(options)
    ])
    
    patterns.push(...sequentialPatterns)
    patterns.push(...sessionPatterns)
    patterns.push(...rhythmPatterns)
    patterns.push(...burstPatterns)
    
    return patterns
  }
  
  /**
   * Detect sequential work patterns (memories that frequently follow each other)
   */
  private async detectSequentialPatterns(options: any): Promise<TemporalPattern[]> {
    const query = `
      // Use indexes for efficient filtering
      MATCH (m1:Memory)
      WHERE m1.created_at IS NOT NULL
        ${options.workspaceId ? 'AND m1.workspace_id = $workspaceId' : ''}
        ${options.userId ? 'AND m1.user_id = $userId' : ''}
        ${options.projectName ? 'AND m1.project_name = $projectName' : ''}
      WITH m1
      LIMIT 200  // Limit first set
      
      MATCH (m2:Memory)
      WHERE m2.id <> m1.id
        AND m2.project_name = m1.project_name
        ${options.workspaceId ? 'AND m2.workspace_id = $workspaceId' : ''}
        ${options.userId ? 'AND m2.user_id = $userId' : ''}
        AND m2.created_at IS NOT NULL
        AND datetime(m1.created_at) < datetime(m2.created_at)
        AND duration.between(datetime(m1.created_at), datetime(m2.created_at)).minutes < 30
      
      WITH m1, m2, 
           duration.between(datetime(m1.created_at), datetime(m2.created_at)).minutes as timeGap
      
      // Group by time proximity to detect natural sequences
      WITH m1, m2, timeGap,
           CASE 
             WHEN m1.user_id = m2.user_id THEN 'same-user'
             ELSE 'different-user'
           END as userPattern,
           CASE
             WHEN timeGap < 5 THEN 'immediate-sequence'
             WHEN timeGap < 15 THEN 'quick-sequence'
             ELSE 'delayed-sequence'
           END as sequenceType
      
      WITH sequenceType,
           userPattern,
           AVG(timeGap) as avgTimeGap,
           STDEV(timeGap) as stdDevTimeGap,
           COUNT(*) as frequency,
           COLLECT(DISTINCT m1.project_name)[0..5] as exampleProjects,
           COLLECT({from: m1.id, to: m2.id, gap: timeGap})[0..10] as examples
      
      WHERE frequency > 3
      RETURN sequenceType + '-' + userPattern as patternType, 
             avgTimeGap, 
             stdDevTimeGap,
             frequency, 
             exampleProjects, 
             examples
      ORDER BY frequency DESC
    `
    
    const result = await neo4jService.executeQuery(query, {
      projectName: options.projectName,
      workspaceId: options.workspaceId,
      userId: options.userId
    })
    
    return result.records.map((record: any) => {
      const avgGap = getNumericValue(record.avgTimeGap)
      const stdDev = getNumericValue(record.stdDevTimeGap)
      const freq = getNumericValue(record.frequency)
      const consistency = stdDev > 0 ? 1 / (1 + stdDev / avgGap) : 1
      
      return {
        id: `temporal-sequential-${record.patternType}`,
        type: PatternType.TEMPORAL,
        name: `Sequential Pattern: ${record.patternType}`,
        description: `Sequential memory pattern with average gap of ${avgGap.toFixed(1)}±${stdDev.toFixed(1)} minutes`,
        confidence: this.calculateConfidence(freq, avgGap, consistency),
        frequency: freq,
        evidence: [
          {
            type: 'temporal',
            description: `Average time gap: ${avgGap.toFixed(1)} minutes (σ=${stdDev.toFixed(1)})`,
            weight: 0.4,
            examples: record.examples.map((e: any) => e.from)
          },
          {
            type: 'structural',
            description: `Pattern consistency: ${(consistency * 100).toFixed(0)}%`,
            weight: 0.3,
            examples: []
          },
          {
            type: 'outcome',
            description: `Observed in ${freq} instances across ${record.exampleProjects.length} projects`,
            weight: 0.3,
            examples: record.examples.map((e: any) => e.to)
          }
        ],
        metadata: {
          averageTimeGap: avgGap,
          timeDistribution: this.categorizeTimeGap(avgGap),
          sessionBased: avgGap < 5,
          consistency,
          exampleProjects: record.exampleProjects
        }
      } as TemporalPattern
    })
  }
  
  /**
   * Detect work session patterns
   */
  private async detectSessionPatterns(options: any): Promise<TemporalPattern[]> {
    const query = `
      MATCH (m:Memory)
      WHERE m.created_at IS NOT NULL
        ${options.projectName ? 'AND m.project_name = $projectName' : ''}
      
      WITH m
      ORDER BY m.created_at
      
      // Group memories into sessions (gap > 2 hours = new session)
      WITH collect(m) as memories
      UNWIND range(0, size(memories)-2) as i
      
      WITH memories[i] as m1, memories[i+1] as m2,
           duration.between(datetime(memories[i].created_at), datetime(memories[i+1].created_at)).minutes as gap
      
      WITH CASE 
        WHEN gap > 120 THEN 'session_break'
        WHEN gap < 5 THEN 'rapid_work'
        WHEN gap < 30 THEN 'continuous_work'
        ELSE 'intermittent_work'
      END as workPattern,
      AVG(gap) as avgGap,
      COUNT(*) as frequency
      
      WHERE frequency > 10
      RETURN workPattern, avgGap, frequency
      ORDER BY frequency DESC
    `
    
    const result = await neo4jService.executeQuery(query, {
      projectName: options.projectName,
      workspaceId: options.workspaceId,
      userId: options.userId
    })
    
    return result.records.map((record: any) => ({
      id: `temporal-session-${record.workPattern}`,
      type: PatternType.TEMPORAL,
      name: `Work Pattern: ${record.workPattern}`,
      description: `${record.workPattern} pattern with average gap of ${getNumericValue(record.avgGap).toFixed(1)} minutes`,
      confidence: 0.7,
      frequency: getNumericValue(record.frequency),
      evidence: [
        {
          type: 'temporal',
          description: `Work pattern identified: ${record.workPattern}`,
          weight: 1.0,
          examples: []
        }
      ],
      metadata: {
        averageTimeGap: getNumericValue(record.avgGap),
        timeDistribution: record.workPattern,
        sessionBased: true
      }
    } as TemporalPattern))
  }
  
  /**
   * Detect work rhythm patterns (time of day, day of week patterns)
   */
  private async detectWorkRhythmPatterns(options: any): Promise<TemporalPattern[]> {
    const query = `
      MATCH (m:Memory)
      WHERE m.created_at IS NOT NULL
        ${options.projectName ? 'AND m.project_name = $projectName' : ''}
      
      WITH m,
           datetime(m.created_at).hour as hour,
           datetime(m.created_at).dayOfWeek as dayOfWeek
      
      WITH hour,
           CASE 
             WHEN hour < 6 THEN 'early_morning'
             WHEN hour < 12 THEN 'morning'
             WHEN hour < 17 THEN 'afternoon'
             WHEN hour < 22 THEN 'evening'
             ELSE 'night'
           END as timeOfDay,
           COUNT(*) as memoryCount
      
      WITH timeOfDay, SUM(memoryCount) as totalCount
      WHERE totalCount > 50
      
      RETURN timeOfDay, totalCount
      ORDER BY totalCount DESC
    `
    
    const result = await neo4jService.executeQuery(query, {
      projectName: options.projectName,
      workspaceId: options.workspaceId,
      userId: options.userId
    })
    
    return result.records.map((record: any) => ({
      id: `temporal-rhythm-${record.timeOfDay}`,
      type: PatternType.TEMPORAL,
      name: `Work Rhythm: ${record.timeOfDay}`,
      description: `High activity during ${record.timeOfDay} with ${getNumericValue(record.totalCount)} memories`,
      confidence: 0.6,
      frequency: record.totalCount?.toNumber() || 0,
      evidence: [
        {
          type: 'temporal',
          description: `Peak work time: ${record.timeOfDay}`,
          weight: 1.0,
          examples: []
        }
      ],
      metadata: {
        timeDistribution: record.timeOfDay,
        sessionBased: false
      }
    } as TemporalPattern))
  }
  
  /**
   * Detect burst patterns (intense activity periods)
   */
  private async detectBurstPatterns(options: any): Promise<TemporalPattern[]> {
    const query = `
      MATCH (m:Memory)
      WHERE m.created_at IS NOT NULL
        ${options.projectName ? 'AND m.project_name = $projectName' : ''}
      
      WITH m
      ORDER BY m.created_at
      
      // Find bursts (5+ memories within 30 minutes)
      MATCH (burst:Memory)
      WHERE burst.created_at IS NOT NULL
        AND burst.created_at >= m.created_at
        AND datetime(burst.created_at) <= datetime(m.created_at) + duration({minutes: 30})
      
      WITH m, COUNT(burst) as burstSize
      WHERE burstSize >= 5
      
      WITH m.project_name as project,
           AVG(burstSize) as avgBurstSize,
           COUNT(*) as burstCount
      
      WHERE burstCount > 3
      RETURN project, avgBurstSize, burstCount
      ORDER BY burstCount DESC
      LIMIT 10
    `
    
    const result = await neo4jService.executeQuery(query, {
      projectName: options.projectName,
      workspaceId: options.workspaceId,
      userId: options.userId
    })
    
    return result.records.map((record: any) => ({
      id: `temporal-burst-${record.project}`,
      type: PatternType.TEMPORAL,
      name: `Burst Pattern in ${record.project}`,
      description: `Intense work bursts averaging ${getNumericValue(record.avgBurstSize).toFixed(1)} memories per 30-minute period`,
      confidence: 0.8,
      frequency: record.burstCount?.toNumber() || 0,
      evidence: [
        {
          type: 'temporal',
          description: `Average burst size: ${getNumericValue(record.avgBurstSize).toFixed(1)} memories`,
          weight: 1.0,
          examples: []
        }
      ],
      metadata: {
        averageTimeGap: 30 / (getNumericValue(record.avgBurstSize) || 1),
        timeDistribution: 'immediate' as const,
        sessionBased: true
      }
    } as TemporalPattern))
  }
  
  async validatePattern(pattern: Pattern): Promise<{
    stillValid: boolean
    confidenceChange: number
  }> {
    // Re-run a simplified version of the detection to validate
    const query = `
      MATCH (m1:Memory)-[:PRECEDED_BY]->(m2:Memory)
      WHERE duration.between(datetime(m1.created_at), datetime(m2.created_at)).minutes < 30
      RETURN COUNT(*) as currentFrequency
    `
    
    const result = await neo4jService.executeQuery(query, {})
    const currentFreq = getNumericValue(result.records[0]?.currentFrequency)
    
    // Compare with original frequency
    const originalFreq = pattern.frequency
    const change = (currentFreq - originalFreq) / originalFreq
    
    return {
      stillValid: currentFreq > originalFreq * 0.5, // Still valid if at least 50% of original
      confidenceChange: change > 0 ? 0.1 : -0.1
    }
  }
  
  private calculateConfidence(frequency: number, avgTimeGap: number, consistency: number = 0.5): number {
    // Higher frequency = higher confidence (logarithmic scale)
    const freqScore = Math.min(Math.log10(frequency + 1) / 3, 1) // 1000+ occurrences = max score
    
    // Consistent time gaps = higher confidence
    const gapScore = avgTimeGap < 15 ? 0.8 : avgTimeGap < 30 ? 0.6 : 0.4
    
    // Weight the scores
    return freqScore * 0.4 + gapScore * 0.3 + consistency * 0.3
  }
  
  private categorizeTimeGap(minutes: number): 'immediate' | 'short' | 'medium' | 'long' {
    if (minutes < 5) return 'immediate'
    if (minutes < 15) return 'short'
    if (minutes < 30) return 'medium'
    return 'long'
  }
}