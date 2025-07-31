/**
 * Test optimized pattern discovery
 */

import { neo4jService } from '../src/lib/neo4j/service'
import { PatternDiscoveryEngine } from '../src/lib/neo4j/pattern-discovery'
import { patternStore } from '../src/lib/neo4j/pattern-discovery/pattern-store'

async function testOptimizedPatterns() {
  console.log('\n=== Testing Optimized Pattern Discovery ===')
  
  try {
    await neo4jService.initialize()
    
    // First check our data distribution
    const dataCheckQuery = `
      MATCH (m:Memory)
      WITH m.user_id as userId, m.project_name as project, COUNT(m) as count
      RETURN userId, project, count
      ORDER BY count DESC
      LIMIT 10
    `
    
    console.log('\nChecking data distribution...')
    const dataResult = await neo4jService.executeQuery(dataCheckQuery, {})
    
    console.log('\nTop user/project combinations:')
    dataResult.records.forEach(record => {
      console.log(`  User: ${record.userId || 'unknown'}, Project: ${record.project}, Count: ${record.count}`)
    })
    
    // Get the most active user/project for testing
    if (dataResult.records.length > 0) {
      const topRecord = dataResult.records[0]
      const userId = topRecord.userId
      const projectName = topRecord.project
      
      console.log(`\nTesting with user: ${userId}, project: ${projectName}`)
      
      // Test pattern discovery with specific user/project
      const engine = new PatternDiscoveryEngine()
      
      console.log('\nDiscovering patterns...')
      const patterns = await engine.discoverPatterns({
        userId: userId,
        projectName: projectName,
        minConfidence: 0.5
      })
      
      console.log(`\nDiscovered ${patterns.length} patterns`)
      
      // Group by type
      const byType = patterns.reduce((acc, p) => {
        acc[p.type] = (acc[p.type] || 0) + 1
        return acc
      }, {} as Record<string, number>)
      
      console.log('\nPatterns by type:')
      Object.entries(byType).forEach(([type, count]) => {
        console.log(`  ${type}: ${count}`)
      })
      
      // Show top 5 patterns
      const topPatterns = patterns
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 5)
      
      console.log('\nTop 5 patterns by confidence:')
      topPatterns.forEach((pattern, i) => {
        console.log(`\n${i + 1}. ${pattern.name}`)
        console.log(`   Type: ${pattern.type}`)
        console.log(`   Confidence: ${pattern.confidence.toFixed(2)}`)
        console.log(`   Frequency: ${pattern.frequency}`)
        console.log(`   Description: ${pattern.description}`)
      })
      
      // Store patterns
      console.log('\nStoring patterns...')
      for (const pattern of topPatterns) {
        try {
          await patternStore.storePattern(pattern, {
            userId: userId,
            projectName: projectName,
            isPublic: false
          })
          console.log(`  ✓ Stored: ${pattern.name}`)
        } catch (error) {
          console.log(`  ✗ Failed to store: ${pattern.name}`)
        }
      }
      
      // Test pattern retrieval
      console.log('\nRetrieving stored patterns...')
      const storedPatterns = await patternStore.getPatterns({
        userId: userId,
        type: topPatterns[0]?.type,
        minConfidence: 0.5
      })
      
      console.log(`Retrieved ${storedPatterns.length} patterns from storage`)
      
    } else {
      console.log('No data found to test with')
    }
    
  } catch (error) {
    console.error('Test failed:', error)
    console.error('Stack:', error.stack)
  }
}

testOptimizedPatterns().catch(console.error)