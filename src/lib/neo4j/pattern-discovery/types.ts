/**
 * Pattern Discovery Types
 */

export enum PatternType {
  TEMPORAL = 'temporal',
  DEBUGGING = 'debugging',
  LEARNING = 'learning',
  ARCHITECTURE = 'architecture',
  ANTI_PATTERN = 'anti_pattern'
}

export enum PatternConfidence {
  LOW = 0.3,
  MEDIUM = 0.5,
  HIGH = 0.7,
  VERY_HIGH = 0.9
}

export interface Pattern {
  id: string
  type: PatternType
  name: string
  description: string
  confidence: number // 0-1
  frequency: number // How often this pattern occurs
  evidence: Evidence[]
  discovered_at?: string
  last_seen?: string
  status?: 'active' | 'invalidated' | 'pending'
  metadata?: Record<string, any>
}

export interface Evidence {
  type: 'temporal' | 'semantic' | 'structural' | 'outcome'
  description: string
  weight: number // Contribution to confidence
  examples: string[] // Node IDs that exemplify this evidence
}

export interface TemporalPattern extends Pattern {
  type: PatternType.TEMPORAL
  metadata: {
    averageTimeGap?: number // in minutes
    timeDistribution?: 'immediate' | 'short' | 'medium' | 'long'
    sessionBased?: boolean
  }
}

export interface DebuggingPattern extends Pattern {
  type: PatternType.DEBUGGING
  metadata: {
    problemType?: string
    solutionType?: string
    averageResolutionTime?: number // in minutes
    successRate?: number
    commonSteps?: string[]
  }
}

export interface LearningPattern extends Pattern {
  type: PatternType.LEARNING
  metadata: {
    conceptProgression?: string[]
    averageLearningTime?: number
    breakthroughIndicators?: string[]
    prerequisiteConcepts?: string[]
  }
}

export interface ArchitecturePattern extends Pattern {
  type: PatternType.ARCHITECTURE
  metadata: {
    codeStructure?: string
    evolutionPath?: string[]
    refactoringType?: string
    improvementMetrics?: Record<string, number>
  }
}

export interface AntiPattern extends Pattern {
  type: PatternType.ANTI_PATTERN
  metadata: {
    problemIndicators?: string[]
    consequences?: string[]
    preventionStrategies?: string[]
    riskLevel?: 'low' | 'medium' | 'high' | 'critical'
  }
}

export interface PatternDetector {
  detectPatterns(options: {
    workspaceId?: string
    projectName?: string
    timeRange?: { start: Date, end: Date }
    minConfidence?: number
  }): Promise<Pattern[]>
  
  validatePattern(pattern: Pattern): Promise<{
    stillValid: boolean
    confidenceChange: number
  }>
}