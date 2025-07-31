#!/usr/bin/env npx tsx
/**
 * Update pattern processor to add tenant isolation to all pattern detection functions
 */

import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const filePath = join(process.cwd(), 'supabase/functions/pattern-processor/index.ts')
let content = readFileSync(filePath, 'utf8')

// List of pattern detection functions to update
const functionsToUpdate = [
  'detectDebuggingPatterns',
  'detectDebuggingPatternsKeywordOnly',
  'detectLearningPatterns',
  'detectLearningPatternsKeywordOnly',
  'detectRefactoringPatterns',
  'detectRefactoringPatternsKeywordOnly',
  'detectProblemSolvingPatterns',
  'detectProblemSolvingPatternsKeywordOnly',
  'detectTemporalSessionPatterns',
  'detectSemanticClusterPatterns',
  'detectMemoryCodeRelationships'
]

// Update function signatures to accept workspaceId and userId
functionsToUpdate.forEach(funcName => {
  // Update function signatures
  const signatureRegex = new RegExp(`async function ${funcName}\\(session: any(?:, logger: any)?\\)`, 'g')
  content = content.replace(signatureRegex, (match) => {
    if (match.includes('logger')) {
      return `async function ${funcName}(session: any, logger: any, workspaceId?: string, userId?: string)`
    } else {
      return `async function ${funcName}(session: any, workspaceId?: string, userId?: string)`
    }
  })
})

// Update keyword-only pattern detection queries to include tenant filter
const keywordOnlyFunctions = [
  'detectDebuggingPatternsKeywordOnly',
  'detectLearningPatternsKeywordOnly',
  'detectRefactoringPatternsKeywordOnly',
  'detectProblemSolvingPatternsKeywordOnly'
]

keywordOnlyFunctions.forEach(funcName => {
  // Add tenant filter variable at the beginning of each function
  const funcBodyRegex = new RegExp(`(async function ${funcName}\\([^)]+\\) {\\s*\\n\\s*const patterns = \\[\\])`, 'g')
  content = content.replace(funcBodyRegex, (match, group1) => {
    return `${group1}\n  const tenantFilter = getTenantFilter(workspaceId, userId)`
  })
  
  // Update queries to include tenant filter
  const queryRegex = new RegExp(`(MATCH \\(e:EntitySummary\\)\\s*\\n\\s*WHERE e\\.pattern_signals CONTAINS[^\\n]+)`, 'gm')
  content = content.replace(queryRegex, (match) => {
    if (!match.includes('AND ${tenantFilter}')) {
      return match + '\n      AND ${tenantFilter}'
    }
    return match
  })
})

// Update detectPatterns function to pass context to all sub-functions
const detectPatternsCallRegex = /await detect(\w+)Patterns(?:KeywordOnly)?\(session(?:, logger)?\)/g
content = content.replace(detectPatternsCallRegex, (match, patternType) => {
  if (match.includes('KeywordOnly')) {
    return `await detect${patternType}PatternsKeywordOnly(session, logger, workspaceId, userId)`
  } else if (match.includes('logger')) {
    return `await detect${patternType}Patterns(session, logger, workspaceId, userId)`
  } else {
    return `await detect${patternType}Patterns(session, workspaceId, userId)`
  }
})

// Update processMemories and processCodeEntities to use tenant filter
const processFunctionRegex = /(MATCH \([mc]:(?:Memory|CodeEntity)\)\s*\n\s*WHERE [mc]\.content IS NOT NULL)/g
content = content.replace(processFunctionRegex, (match, group1) => {
  const alias = match.includes('Memory') ? 'm' : 'c'
  return `${group1}\n        AND ${getTenantFilter('workspace_id_placeholder', 'user_id_placeholder', alias)}`
})

// Special handling for detectMemoryCodeRelationships - it already has tenant isolation
// Just update its signature
content = content.replace(
  /async function detectMemoryCodeRelationships\(session: any\)/,
  'async function detectMemoryCodeRelationships(session: any, workspaceId?: string, userId?: string)'
)

// Update the semantic pattern detection functions
const semanticFunctions = ['detectDebuggingPatterns', 'detectLearningPatterns', 'detectRefactoringPatterns', 'detectProblemSolvingPatterns']
semanticFunctions.forEach(funcName => {
  // Update seed queries to include tenant filter
  const seedQueryRegex = new RegExp(`(MATCH \\(e:EntitySummary\\)\\s*\\n\\s*WHERE e\\.pattern_signals CONTAINS[^\\n]+\\s*\\n\\s*AND e\\.embedding IS NOT NULL)`, 'gm')
  content = content.replace(seedQueryRegex, (match) => {
    if (!match.includes('AND ${tenantFilter}')) {
      return match.replace(
        'AND e.embedding IS NOT NULL',
        'AND e.embedding IS NOT NULL\n      AND ${tenantFilter}'
      )
    }
    return match
  })
})

// Write the updated content
writeFileSync(filePath, content, 'utf8')

console.log('✅ Updated pattern processor with tenant isolation')
console.log('Next steps:')
console.log('1. Review the changes in the pattern processor')
console.log('2. Test pattern detection with workspace context')
console.log('3. Deploy the updated edge function')