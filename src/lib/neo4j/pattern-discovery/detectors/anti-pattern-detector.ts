/**
 * Anti-Pattern Detector
 * 
 * Discovers problematic patterns that should be avoided:
 * - Circular dependencies
 * - God objects/functions
 * - Abandoned code patterns
 * - Performance anti-patterns
 * - Inefficient work patterns
 */

import { neo4jService } from '../../service'
import { log } from '@/lib/logger'
import { Pattern, PatternType, PatternDetector, AntiPattern, Evidence } from '../types'
import { getNumericValue } from '../utils'

export class AntiPatternDetector implements PatternDetector {
  
  async detectPatterns(options: {
    workspaceId?: string
    projectName?: string
    timeRange?: { start: Date, end: Date }
    minConfidence?: number
  } = {}): Promise<AntiPattern[]> {
    log.info('Detecting anti-patterns', options)
    
    const patterns: AntiPattern[] = []
    
    // Run different anti-pattern detections
    const [
      circularDependencies,
      godObjects,
      abandonedCode,
      performanceAntiPatterns,
      inefficientWorkPatterns
    ] = await Promise.all([
      this.detectCircularDependencies(options),
      this.detectGodObjects(options),
      this.detectAbandonedCode(options),
      this.detectPerformanceAntiPatterns(options),
      this.detectInefficientWorkPatterns(options)
    ])
    
    patterns.push(...circularDependencies)
    patterns.push(...godObjects)
    patterns.push(...abandonedCode)
    patterns.push(...performanceAntiPatterns)
    patterns.push(...inefficientWorkPatterns)
    
    return patterns
  }
  
  /**
   * Detect circular dependencies
   */
  private async detectCircularDependencies(options: any): Promise<AntiPattern[]> {
    const query = `
      // Find circular import patterns
      MATCH path = (c1:CodeEntity)-[:USES_IMPORT*2..5]->(c1)
      WHERE c1.type IN ['class', 'module', 'function']
        ${options.workspaceId ? 'AND c1.workspace_id = $workspaceId' : ''}
        ${options.projectName ? 'AND c1.project_name = $projectName' : ''}
      
      WITH c1, 
           length(path) as cycleLength,
           [n IN nodes(path) | n.name] as cycle
      
      WITH cycleLength,
           COUNT(*) as frequency,
           COLLECT({
             startNode: c1.name,
             cycle: cycle,
             length: cycleLength
           })[0..5] as examples
      
      WHERE frequency > 1
      
      RETURN 'circular-dependency' as antiPattern,
             cycleLength,
             frequency,
             examples
      ORDER BY frequency DESC
      LIMIT 10
    `
    
    const result = await neo4jService.executeQuery(query, {
      workspaceId: options.workspaceId,
      projectName: options.projectName
    })
    
    return result.records.map((record: any) => ({
      id: `anti-pattern-circular-${record.cycleLength}`,
      type: PatternType.ANTI_PATTERN,
      name: `Circular Dependency (${record.cycleLength}-node cycle)`,
      description: `Circular import dependency with ${record.cycleLength} nodes`,
      confidence: 0.9, // High confidence for structural issues
      frequency: getNumericValue(record.frequency),
      evidence: [
        {
          type: 'structural',
          description: `${record.cycleLength}-node dependency cycle`,
          weight: 0.8,
          examples: record.examples?.map((e: any) => e.startNode) || []
        },
        {
          type: 'outcome',
          description: `Found ${getNumericValue(record.frequency)} instances`,
          weight: 0.2,
          examples: []
        }
      ],
      metadata: {
        severity: record.cycleLength > 3 ? 'high' : 'medium',
        impact: 'maintainability',
        recommendation: 'Refactor to break circular dependencies',
        examples: record.examples
      }
    } as AntiPattern))
  }
  
  /**
   * Detect god objects/functions (too many responsibilities)
   */
  private async detectGodObjects(options: any): Promise<AntiPattern[]> {
    const query = `
      // Find entities with too many relationships or methods
      MATCH (c:CodeEntity)
      WHERE c.type IN ['class', 'function', 'module']
        ${options.workspaceId ? 'AND c.workspace_id = $workspaceId' : ''}
        ${options.projectName ? 'AND c.project_name = $projectName' : ''}
      
      // Count outgoing relationships
      OPTIONAL MATCH (c)-[r:CALLS|USES_IMPORT|REFERENCES]->(other)
      WITH c, COUNT(DISTINCT other) as dependencyCount
      
      // Count methods for classes
      OPTIONAL MATCH (c)<-[:DEFINED_IN]-(method:CodeEntity {type: 'method'})
      WITH c, dependencyCount, COUNT(method) as methodCount
      
      // Calculate complexity score
      WITH c,
           dependencyCount + methodCount as complexityScore,
           dependencyCount,
           methodCount
      WHERE complexityScore > 20  // Threshold for god object
      
      WITH CASE
             WHEN complexityScore > 50 THEN 'extreme-god-object'
             WHEN complexityScore > 30 THEN 'severe-god-object'
             ELSE 'god-object'
           END as severity,
           AVG(complexityScore) as avgComplexity,
           COUNT(*) as frequency,
           COLLECT({
             name: c.name,
             type: c.type,
             complexity: complexityScore,
             dependencies: dependencyCount,
             methods: methodCount
           })[0..5] as examples
      
      RETURN severity, avgComplexity, frequency, examples
      ORDER BY avgComplexity DESC
    `
    
    const result = await neo4jService.executeQuery(query, {
      workspaceId: options.workspaceId,
      projectName: options.projectName
    })
    
    return result.records.map((record: any) => ({
      id: `anti-pattern-${record.severity}`,
      type: PatternType.ANTI_PATTERN,
      name: `God Object: ${record.severity}`,
      description: `Entities with excessive responsibilities (avg complexity: ${getNumericValue(record.avgComplexity).toFixed(0)})`,
      confidence: 0.8,
      frequency: getNumericValue(record.frequency),
      evidence: [
        {
          type: 'structural',
          description: `Average complexity score: ${getNumericValue(record.avgComplexity).toFixed(0)}`,
          weight: 0.7,
          examples: record.examples?.map((e: any) => e.name) || []
        },
        {
          type: 'outcome',
          description: `${getNumericValue(record.frequency)} god objects found`,
          weight: 0.3,
          examples: []
        }
      ],
      metadata: {
        severity: record.severity.includes('extreme') ? 'critical' : 'high',
        impact: 'maintainability, testability',
        recommendation: 'Split responsibilities using Single Responsibility Principle',
        examples: record.examples
      }
    } as AntiPattern))
  }
  
  /**
   * Detect abandoned code patterns
   */
  private async detectAbandonedCode(options: any): Promise<AntiPattern[]> {
    const query = `
      // Find code that hasn't been referenced in recent memories
      MATCH (c:CodeEntity)
      WHERE c.created_at IS NOT NULL
        ${options.workspaceId ? 'AND c.workspace_id = $workspaceId' : ''}
        ${options.projectName ? 'AND c.project_name = $projectName' : ''}
      
      // Check for recent memory references
      OPTIONAL MATCH (m:Memory)-[:REFERENCES_CODE|DISCUSSES]->(c)
      WHERE datetime(m.created_at) > datetime() - duration({days: 90})
      
      WITH c, COUNT(m) as recentReferences
      WHERE recentReferences = 0
        AND datetime(c.created_at) < datetime() - duration({days: 90})
      
      // Group by type
      WITH c.type as entityType,
           COUNT(*) as abandonedCount,
           COLLECT({
             name: c.name,
             file: c.file_path,
             created: c.created_at
           })[0..10] as examples
      
      WHERE abandonedCount > 5
      
      RETURN entityType, abandonedCount, examples
      ORDER BY abandonedCount DESC
    `
    
    const result = await neo4jService.executeQuery(query, {
      workspaceId: options.workspaceId,
      projectName: options.projectName
    })
    
    return result.records.map((record: any) => ({
      id: `anti-pattern-abandoned-${record.entityType}`,
      type: PatternType.ANTI_PATTERN,
      name: `Abandoned Code: ${record.entityType}`,
      description: `${getNumericValue(record.abandonedCount)} ${record.entityType} entities with no recent activity`,
      confidence: 0.7,
      frequency: getNumericValue(record.abandonedCount),
      evidence: [
        {
          type: 'temporal',
          description: `No references in last 90 days`,
          weight: 0.6,
          examples: record.examples?.map((e: any) => e.name) || []
        },
        {
          type: 'structural',
          description: `${getNumericValue(record.abandonedCount)} abandoned entities`,
          weight: 0.4,
          examples: []
        }
      ],
      metadata: {
        severity: 'medium',
        impact: 'technical debt',
        recommendation: 'Review and consider removing unused code',
        examples: record.examples
      }
    } as AntiPattern))
  }
  
  /**
   * Detect performance anti-patterns in memory access
   */
  private async detectPerformanceAntiPatterns(options: any): Promise<AntiPattern[]> {
    const query = `
      // Find patterns of inefficient memory queries
      MATCH (m:Memory)
      WHERE m.created_at IS NOT NULL
        ${options.workspaceId ? 'AND m.workspace_id = $workspaceId' : ''}
        ${options.userId ? 'AND m.user_id = $userId' : ''}
        ${options.projectName ? 'AND m.project_name = $projectName' : ''}
      
      WITH m, datetime(m.created_at) as timestamp
      ORDER BY timestamp
      
      // Look for burst patterns that might indicate inefficient queries
      WITH collect({id: m.id, time: timestamp}) as memories
      UNWIND range(0, size(memories)-10) as i
      
      WITH memories[i..i+10] as window,
           duration.between(memories[i].time, memories[i+9].time).seconds as windowDuration
      WHERE windowDuration < 10  // 10 memories in 10 seconds
      
      WITH COUNT(*) as burstCount,
           AVG(windowDuration) as avgBurstDuration
      WHERE burstCount > 5
      
      RETURN 'memory-query-burst' as antiPattern,
             burstCount,
             avgBurstDuration
    `
    
    const result = await neo4jService.executeQuery(query, {
      workspaceId: options.workspaceId,
      userId: options.userId,
      projectName: options.projectName
    })
    
    return result.records.map((record: any) => ({
      id: 'anti-pattern-memory-burst',
      type: PatternType.ANTI_PATTERN,
      name: 'Memory Query Burst Pattern',
      description: `Detected ${getNumericValue(record.burstCount)} burst patterns indicating potential inefficient queries`,
      confidence: 0.6,
      frequency: getNumericValue(record.burstCount),
      evidence: [
        {
          type: 'temporal',
          description: `Average burst duration: ${getNumericValue(record.avgBurstDuration).toFixed(1)}s`,
          weight: 0.7,
          examples: []
        },
        {
          type: 'outcome',
          description: 'May indicate N+1 query problems',
          weight: 0.3,
          examples: []
        }
      ],
      metadata: {
        severity: 'medium',
        impact: 'performance',
        recommendation: 'Review query patterns and consider batching'
      }
    } as AntiPattern))
  }
  
  /**
   * Detect inefficient work patterns
   */
  private async detectInefficientWorkPatterns(options: any): Promise<AntiPattern[]> {
    const query = `
      // Find patterns of context switching
      MATCH (m1:Memory)
      WHERE m1.created_at IS NOT NULL
        ${options.workspaceId ? 'AND m1.workspace_id = $workspaceId' : ''}
        ${options.userId ? 'AND m1.user_id = $userId' : ''}
      WITH m1
      ORDER BY m1.created_at
      LIMIT 1000
      
      // Look for rapid project switching
      WITH collect(m1) as memories
      UNWIND range(0, size(memories)-2) as i
      
      WITH memories[i] as m1, memories[i+1] as m2,
           duration.between(datetime(memories[i].created_at), datetime(memories[i+1].created_at)).minutes as gap
      WHERE m1.project_name <> m2.project_name
        AND gap < 30  // Project switch within 30 minutes
      
      WITH COUNT(*) as switchCount,
           AVG(gap) as avgSwitchTime,
           COLLECT(DISTINCT m1.project_name)[0..5] as projects
      WHERE switchCount > 10
      
      RETURN 'excessive-context-switching' as antiPattern,
             switchCount,
             avgSwitchTime,
             projects
    `
    
    const result = await neo4jService.executeQuery(query, {
      workspaceId: options.workspaceId,
      userId: options.userId
    })
    
    return result.records.map((record: any) => ({
      id: 'anti-pattern-context-switching',
      type: PatternType.ANTI_PATTERN,
      name: 'Excessive Context Switching',
      description: `${getNumericValue(record.switchCount)} rapid project switches (avg ${getNumericValue(record.avgSwitchTime).toFixed(0)}min)`,
      confidence: 0.7,
      frequency: getNumericValue(record.switchCount),
      evidence: [
        {
          type: 'temporal',
          description: `Average switch time: ${getNumericValue(record.avgSwitchTime).toFixed(0)} minutes`,
          weight: 0.5,
          examples: []
        },
        {
          type: 'outcome',
          description: `Switching between: ${(record.projects || []).join(', ')}`,
          weight: 0.5,
          examples: record.projects || []
        }
      ],
      metadata: {
        severity: 'medium',
        impact: 'productivity',
        recommendation: 'Consider longer focused work sessions per project'
      }
    } as AntiPattern))
  }
  
  async validatePattern(pattern: Pattern): Promise<{
    stillValid: boolean
    confidenceChange: number
  }> {
    // Anti-patterns should decrease in frequency over time (improvement)
    // So if they still exist at same frequency, confidence goes up (bad)
    // If they decrease, confidence goes down (good - being addressed)
    
    const query = `
      MATCH (c:CodeEntity)
      WHERE c.type IN ['class', 'interface', 'function', 'module']
      RETURN COUNT(c) as entityCount
      LIMIT 1
    `
    
    const result = await neo4jService.executeQuery(query, {})
    const count = getNumericValue(result.records[0]?.entityCount)
    
    return {
      stillValid: count > 0, // Anti-patterns are valid as long as code exists
      confidenceChange: pattern.frequency > 10 ? 0.1 : -0.1 // More instances = worse
    }
  }
}