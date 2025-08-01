#!/usr/bin/env npx tsx

/**
 * Compare old vs new MCP tool documentation
 */

const OLD_DESCRIPTIONS = {
  search: "Search across code, memories, and GitHub data using natural language",
  searchCode: "Search code with language-specific understanding",
  searchMemories: "Search development conversations and decisions",
  exploreRelationships: "Find connections between entities in the knowledge graph",
  inspectEntity: "Get comprehensive details about any entity"
}

import { TOOL_DESCRIPTIONS } from '../src/lib/mcp/tool-descriptions'

console.log('MCP Tool Documentation Comparison\n')
console.log('=================================\n')

Object.keys(OLD_DESCRIPTIONS).forEach(toolName => {
  const oldDesc = OLD_DESCRIPTIONS[toolName as keyof typeof OLD_DESCRIPTIONS]
  const newDesc = TOOL_DESCRIPTIONS[toolName as keyof typeof TOOL_DESCRIPTIONS]?.description
  
  console.log(`Tool: ${toolName}`)
  console.log('─'.repeat(50))
  
  console.log('OLD (length: ' + oldDesc.length + ' chars):')
  console.log(oldDesc)
  console.log()
  
  console.log('NEW (length: ' + (newDesc?.length || 0) + ' chars):')
  if (newDesc) {
    // Show first few lines of new description
    const lines = newDesc.split('\n').slice(0, 10)
    console.log(lines.join('\n'))
    if (newDesc.split('\n').length > 10) {
      console.log('... [' + (newDesc.split('\n').length - 10) + ' more lines]')
    }
  }
  
  console.log('\nImprovement factor: ' + Math.round((newDesc?.length || 0) / oldDesc.length) + 'x')
  console.log('\n' + '='.repeat(70) + '\n')
})

// Summary statistics
const totalOldLength = Object.values(OLD_DESCRIPTIONS).reduce((sum, desc) => sum + desc.length, 0)
const totalNewLength = Object.values(TOOL_DESCRIPTIONS).reduce((sum, tool) => sum + (tool.description?.length || 0), 0)

console.log('SUMMARY STATISTICS')
console.log('==================')
console.log('Total old documentation:', totalOldLength, 'characters')
console.log('Total new documentation:', totalNewLength, 'characters')
console.log('Overall improvement:', Math.round(totalNewLength / totalOldLength) + 'x more comprehensive')
console.log()
console.log('New documentation includes:')
console.log('- Detailed overviews and use cases')
console.log('- Multiple examples with expected results')
console.log('- Integration guidance')
console.log('- Pro tips for effective usage')
console.log('- Complete response format examples')
console.log('- When to use vs when not to use')