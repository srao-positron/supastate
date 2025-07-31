/**
 * Test the Pattern Discovery Engine with real data
 */

import { patternDiscoveryEngine } from '../src/lib/neo4j/pattern-discovery'
import { neo4jService } from '../src/lib/neo4j/service'
import { log } from '../src/lib/logger'

async function testPatternDiscovery() {
  console.log('\n=== Testing Pattern Discovery Engine ===')
  
  try {
    // Initialize Neo4j
    await neo4jService.initialize()
    
    // Test with a specific project first
    console.log('\n1. Testing with Supastate project...')
    const supastatePatterns = await patternDiscoveryEngine.discoverPatterns({
      projectName: 'supastate',
      minConfidence: 0.5
    })
    
    console.log(`\nFound ${supastatePatterns.length} patterns in Supastate project:`)
    supastatePatterns.slice(0, 5).forEach(pattern => {
      console.log(`\n- ${pattern.name}`)
      console.log(`  Type: ${pattern.type}`)
      console.log(`  Confidence: ${pattern.confidence.toFixed(2)}`)
      console.log(`  Frequency: ${pattern.frequency}`)
      console.log(`  Description: ${pattern.description}`)
      console.log(`  Evidence:`)
      pattern.evidence.forEach(e => {
        console.log(`    - ${e.description} (weight: ${e.weight})`)
      })
    })
    
    // Test temporal patterns specifically
    console.log('\n\n2. Testing temporal patterns only...')
    const temporalPatterns = await patternDiscoveryEngine.discoverPatternsByType('temporal', {
      minConfidence: 0.4
    })
    
    console.log(`\nFound ${temporalPatterns.length} temporal patterns:`)
    temporalPatterns.slice(0, 3).forEach(pattern => {
      console.log(`\n- ${pattern.name}`)
      console.log(`  Description: ${pattern.description}`)
      console.log(`  Frequency: ${pattern.frequency}`)
    })
    
    // Test debugging patterns
    console.log('\n\n3. Testing debugging patterns...')
    const debuggingPatterns = await patternDiscoveryEngine.discoverPatternsByType('debugging', {
      minConfidence: 0.5
    })
    
    console.log(`\nFound ${debuggingPatterns.length} debugging patterns:`)
    debuggingPatterns.slice(0, 3).forEach(pattern => {
      console.log(`\n- ${pattern.name}`)
      console.log(`  Description: ${pattern.description}`)
      console.log(`  Frequency: ${pattern.frequency}`)
    })
    
    // Test pattern validation
    console.log('\n\n4. Testing pattern validation...')
    if (supastatePatterns.length > 0) {
      const validationResult = await patternDiscoveryEngine.validatePatterns()
      console.log('\nValidation results:')
      console.log(`  Validated: ${validationResult.validated.length}`)
      console.log(`  Invalidated: ${validationResult.invalidated.length}`)
      console.log(`  Strengthened: ${validationResult.strengthened.length}`)
    }
    
    // Check if any memory-code relationships were created
    console.log('\n\n5. Checking created relationships...')
    const relationshipQuery = `
      MATCH (m:Memory)-[r]->(c:CodeEntity)
      WHERE type(r) IN ['DISCUSSES', 'REFERENCES_CODE', 'DEBUGS', 'DOCUMENTS', 'MODIFIES']
      RETURN type(r) as relType, COUNT(r) as count
      ORDER BY count DESC
    `
    
    const relResult = await neo4jService.executeQuery(relationshipQuery, {})
    console.log('\nCreated relationships:')
    relResult.records.forEach(record => {
      console.log(`  ${record.relType}: ${record.count?.toNumber() || 0}`)
    })
    
    console.log('\n=== Pattern Discovery Test Complete ===')
    
  } catch (error) {
    console.error('Pattern discovery test failed:', error)
  }
}

// Run the test
testPatternDiscovery().catch(console.error)