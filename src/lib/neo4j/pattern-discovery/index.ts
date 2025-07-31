/**
 * Pattern Discovery Engine
 * 
 * This engine discovers emergent patterns from the graph structure:
 * - Temporal patterns (how memories flow over time)
 * - Debugging patterns (how bugs get fixed)
 * - Learning patterns (how understanding evolves)
 * - Architecture patterns (how code structures emerge)
 * - Anti-patterns (what leads to problems)
 */

import { neo4jService } from '../service'
import { log } from '@/lib/logger'
import { 
  TemporalPatternDetector,
  DebuggingPatternDetector,
  MemoryCodeRelationshipDetector,
  LearningPatternDetector,
  ArchitecturePatternDetector,
  AntiPatternDetector
} from './detectors'
import { Pattern, PatternType, PatternConfidence } from './types'

export class PatternDiscoveryEngine {
  private temporalDetector: TemporalPatternDetector
  private debuggingDetector: DebuggingPatternDetector
  private memoryCodeDetector: MemoryCodeRelationshipDetector
  private learningDetector: LearningPatternDetector
  private architectureDetector: ArchitecturePatternDetector
  private antiPatternDetector: AntiPatternDetector

  constructor() {
    this.temporalDetector = new TemporalPatternDetector()
    this.debuggingDetector = new DebuggingPatternDetector()
    this.memoryCodeDetector = new MemoryCodeRelationshipDetector()
    this.learningDetector = new LearningPatternDetector()
    this.architectureDetector = new ArchitecturePatternDetector()
    this.antiPatternDetector = new AntiPatternDetector()
  }

  /**
   * Discover all types of patterns from the graph
   */
  async discoverPatterns(options: {
    workspaceId?: string
    projectName?: string
    timeRange?: { start: Date, end: Date }
    minConfidence?: number
  } = {}): Promise<Pattern[]> {
    log.info('Starting pattern discovery', options)

    try {
      await neo4jService.initialize()

      // Run all detectors in parallel
      const [
        temporalPatterns,
        debuggingPatterns,
        memoryCodePatterns,
        learningPatterns,
        architecturePatterns,
        antiPatterns
      ] = await Promise.all([
        this.temporalDetector.detectPatterns(options),
        this.debuggingDetector.detectPatterns(options),
        this.memoryCodeDetector.detectPatterns(options),
        this.learningDetector.detectPatterns(options),
        this.architectureDetector.detectPatterns(options),
        this.antiPatternDetector.detectPatterns(options)
      ])

      // Combine all patterns
      const allPatterns = [
        ...temporalPatterns,
        ...debuggingPatterns,
        ...memoryCodePatterns,
        ...learningPatterns,
        ...architecturePatterns,
        ...antiPatterns
      ]

      // Filter by minimum confidence if specified
      const filteredPatterns = options.minConfidence
        ? allPatterns.filter(p => p.confidence >= options.minConfidence!)
        : allPatterns

      // Sort by confidence and frequency
      const sortedPatterns = filteredPatterns.sort((a, b) => {
        const scoreA = a.confidence * a.frequency
        const scoreB = b.confidence * b.frequency
        return scoreB - scoreA
      })

      log.info('Pattern discovery completed', {
        totalPatterns: sortedPatterns.length,
        byType: this.countPatternsByType(sortedPatterns)
      })

      // Store the discovered patterns
      await this.storePatterns(sortedPatterns)

      return sortedPatterns
    } catch (error) {
      log.error('Pattern discovery failed', error)
      throw error
    }
  }

  /**
   * Discover patterns for a specific type
   */
  async discoverPatternsByType(
    type: PatternType,
    options: Parameters<typeof this.discoverPatterns>[0] = {}
  ): Promise<Pattern[]> {
    log.info('Discovering patterns by type', { type, ...options })

    await neo4jService.initialize()

    switch (type) {
      case PatternType.TEMPORAL:
        return this.temporalDetector.detectPatterns(options)
      case PatternType.DEBUGGING:
        return this.debuggingDetector.detectPatterns(options)
      case PatternType.LEARNING:
        return this.learningDetector.detectPatterns(options)
      case PatternType.ARCHITECTURE:
        return this.architectureDetector.detectPatterns(options)
      case PatternType.ANTI_PATTERN:
        return this.antiPatternDetector.detectPatterns(options)
      default:
        throw new Error(`Unknown pattern type: ${type}`)
    }
  }

  /**
   * Validate existing patterns against current data
   */
  async validatePatterns(): Promise<{
    validated: Pattern[]
    invalidated: Pattern[]
    strengthened: Pattern[]
  }> {
    log.info('Validating existing patterns')

    const query = `
      MATCH (p:Pattern)
      WHERE p.status = 'active'
      RETURN p
    `

    const result = await neo4jService.executeQuery(query, {})
    const existingPatterns = result.records.map((r: any) => r.p as Pattern)

    const validated: Pattern[] = []
    const invalidated: Pattern[] = []
    const strengthened: Pattern[] = []

    for (const pattern of existingPatterns) {
      const validation = await this.validatePattern(pattern)
      
      if (validation.stillValid) {
        validated.push(pattern)
        
        if (validation.confidenceChange > 0) {
          strengthened.push({
            ...pattern,
            confidence: pattern.confidence + validation.confidenceChange
          })
        }
      } else {
        invalidated.push(pattern)
      }
    }

    // Update pattern statuses in the graph
    await this.updatePatternStatuses(validated, invalidated, strengthened)

    log.info('Pattern validation completed', {
      validated: validated.length,
      invalidated: invalidated.length,
      strengthened: strengthened.length
    })

    return { validated, invalidated, strengthened }
  }

  /**
   * Store discovered patterns in the graph
   */
  private async storePatterns(patterns: Pattern[]): Promise<void> {
    if (patterns.length === 0) return

    const query = `
      UNWIND $patterns as pattern
      MERGE (p:Pattern {id: pattern.id})
      SET p += pattern,
          p.discovered_at = COALESCE(p.discovered_at, datetime()),
          p.last_seen = datetime(),
          p.status = 'active'
      RETURN p
    `

    await neo4jService.executeQuery(query, { patterns })
  }

  /**
   * Validate a single pattern
   */
  private async validatePattern(pattern: Pattern): Promise<{
    stillValid: boolean
    confidenceChange: number
  }> {
    // Pattern-specific validation logic
    const detector = this.getDetectorForType(pattern.type)
    return detector.validatePattern(pattern)
  }

  /**
   * Get the appropriate detector for a pattern type
   */
  private getDetectorForType(type: PatternType) {
    switch (type) {
      case PatternType.TEMPORAL:
        return this.temporalDetector
      case PatternType.DEBUGGING:
        return this.debuggingDetector
      case PatternType.LEARNING:
        return this.learningDetector
      case PatternType.ARCHITECTURE:
        return this.architectureDetector
      case PatternType.ANTI_PATTERN:
        return this.antiPatternDetector
      default:
        throw new Error(`Unknown pattern type: ${type}`)
    }
  }

  /**
   * Update pattern statuses in the graph
   */
  private async updatePatternStatuses(
    validated: Pattern[],
    invalidated: Pattern[],
    strengthened: Pattern[]
  ): Promise<void> {
    // Mark invalidated patterns
    if (invalidated.length > 0) {
      await neo4jService.executeQuery(`
        UNWIND $patternIds as id
        MATCH (p:Pattern {id: id})
        SET p.status = 'invalidated',
            p.invalidated_at = datetime()
      `, { patternIds: invalidated.map(p => p.id) })
    }

    // Update strengthened patterns
    if (strengthened.length > 0) {
      await neo4jService.executeQuery(`
        UNWIND $patterns as pattern
        MATCH (p:Pattern {id: pattern.id})
        SET p.confidence = pattern.confidence,
            p.last_strengthened = datetime()
      `, { patterns: strengthened })
    }
  }

  /**
   * Count patterns by type
   */
  private countPatternsByType(patterns: Pattern[]): Record<PatternType, number> {
    return patterns.reduce((acc, pattern) => {
      acc[pattern.type] = (acc[pattern.type] || 0) + 1
      return acc
    }, {} as Record<PatternType, number>)
  }
}

export const patternDiscoveryEngine = new PatternDiscoveryEngine()