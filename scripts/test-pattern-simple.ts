/**
 * Simple test for pattern discovery
 */

import { neo4jService } from '../src/lib/neo4j/service'
import { PatternDiscoveryEngine } from '../src/lib/neo4j/pattern-discovery'

async function testPatternSimple() {
  console.log('\n=== Testing Pattern Discovery (Simple) ===')
  
  try {
    await neo4jService.initialize()
    
    // First check if we have data
    const checkQuery = `
      MATCH (m:Memory)
      WHERE m.project_name = 'supastate'
      RETURN COUNT(m) as memoryCount,
             COUNT(CASE WHEN m.embedding IS NOT NULL THEN 1 END) as withEmbeddings,
             MIN(m.created_at) as firstMemory,
             MAX(m.created_at) as lastMemory
    `
    
    const checkResult = await neo4jService.executeQuery(checkQuery, {})
    if (checkResult.records.length > 0) {
      const stats = checkResult.records[0]
      console.log('\nData check:')
      console.log(`  Memories: ${stats.memoryCount}`)
      console.log(`  With embeddings: ${stats.withEmbeddings}`)
      console.log(`  First memory: ${stats.firstMemory}`)
      console.log(`  Last memory: ${stats.lastMemory}`)
    }
    
    // Now test pattern discovery
    console.log('\nTesting pattern discovery...')
    const engine = new PatternDiscoveryEngine()
    
    const patterns = await engine.discoverPatterns({
      projectName: 'supastate',
      minConfidence: 0.5
    })
    
    console.log(`\nDiscovered ${patterns.length} patterns`)
    
    // Group patterns by type
    const patternsByType = patterns.reduce((acc, pattern) => {
      acc[pattern.type] = (acc[pattern.type] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    
    console.log('\nPatterns by type:')
    Object.entries(patternsByType).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`)
    })
    
    // Show top 5 patterns by confidence
    const topPatterns = patterns
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5)
    
    console.log('\nTop 5 patterns by confidence:')
    topPatterns.forEach((pattern, i) => {
      console.log(`${i + 1}. ${pattern.name}`)
      console.log(`   Type: ${pattern.type}`)
      console.log(`   Confidence: ${pattern.confidence.toFixed(2)}`)
      console.log(`   Frequency: ${pattern.frequency}`)
      console.log(`   Description: ${pattern.description}`)
    })
    
  } catch (error) {
    console.error('Test failed:', error)
    if (error.message?.includes('duration.between')) {
      console.log('\nDate conversion issue detected. Memories might be stored with string dates.')
    }
  }
}

testPatternSimple().catch(console.error)