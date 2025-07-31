// Re-export pattern detection functions from the pattern-processor directory
// This allows the worker to use the exact same detection logic

export {
  detectDebuggingPatterns,
  detectLearningPatterns,
  detectRefactoringPatterns,
  detectProblemSolvingPatterns,
  detectTemporalSessions,
  detectSemanticClusters,
  detectMemoryCodeRelationships,
  mergeAndStorePatterns
} from '../pattern-processor/pattern-detectors.ts'