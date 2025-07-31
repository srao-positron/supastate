#!/usr/bin/env tsx

import { neo4jService } from '../src/lib/neo4j/service'
import dotenv from 'dotenv'
import { resolve } from 'path'

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env.local') })

async function fixSummarizesRelationships() {
  console.log('🔧 Fixing SUMMARIZES Relationships')
  console.log('=' .repeat(80))
  
  try {
    // First, check current state
    const checkResult = await neo4jService.executeQuery(`
      MATCH (s:EntitySummary)
      WHERE s.entity_id IS NOT NULL
      OPTIONAL MATCH (s)-[r:SUMMARIZES]->()
      RETURN 
        count(DISTINCT s) as totalSummaries,
        count(r) as existingRelationships
    `, {})
    
    const stats = checkResult.records[0]
    console.log(`Total EntitySummary nodes with entity_id: ${stats.totalSummaries}`)
    console.log(`Existing SUMMARIZES relationships: ${stats.existingRelationships}`)
    
    if (stats.existingRelationships > 0) {
      console.log('\n✅ SUMMARIZES relationships already exist!')
      return
    }
    
    // Create SUMMARIZES relationships based on entity_id and entity_type
    console.log('\n📝 Creating SUMMARIZES relationships...')
    
    // For Memory entities
    const memoryResult = await neo4jService.executeQuery(`
      MATCH (s:EntitySummary)
      WHERE s.entity_id IS NOT NULL 
        AND s.entity_type = 'memory'
      MATCH (m:Memory {id: s.entity_id})
      WHERE NOT EXISTS((s)-[:SUMMARIZES]->(m))
      CREATE (s)-[:SUMMARIZES]->(m)
      RETURN count(s) as created
    `, {})
    
    const memoriesCreated = memoryResult.records[0]?.created || 0
    console.log(`✅ Created ${memoriesCreated} SUMMARIZES relationships for Memory nodes`)
    
    // For CodeEntity entities
    const codeResult = await neo4jService.executeQuery(`
      MATCH (s:EntitySummary)
      WHERE s.entity_id IS NOT NULL 
        AND s.entity_type = 'code'
      MATCH (c:CodeEntity {id: s.entity_id})
      WHERE NOT EXISTS((s)-[:SUMMARIZES]->(c))
      CREATE (s)-[:SUMMARIZES]->(c)
      RETURN count(s) as created
    `, {})
    
    const codeCreated = codeResult.records[0]?.created || 0
    console.log(`✅ Created ${codeCreated} SUMMARIZES relationships for CodeEntity nodes`)
    
    // Verify the fix
    const verifyResult = await neo4jService.executeQuery(`
      MATCH (s:EntitySummary)-[r:SUMMARIZES]->(entity)
      RETURN 
        labels(entity)[0] as entityType,
        count(r) as relationshipCount
      ORDER BY entityType
    `, {})
    
    console.log('\n📊 Verification - SUMMARIZES relationships by type:')
    verifyResult.records.forEach(record => {
      console.log(`  - ${record.entityType}: ${record.relationshipCount} relationships`)
    })
    
    // Check for orphaned summaries
    const orphanedResult = await neo4jService.executeQuery(`
      MATCH (s:EntitySummary)
      WHERE s.entity_id IS NOT NULL
        AND NOT EXISTS((s)-[:SUMMARIZES]->())
      RETURN count(s) as orphaned
    `, {})
    
    const orphanedCount = orphanedResult.records[0]?.orphaned || 0
    if (orphanedCount > 0) {
      console.log(`\n⚠️  Warning: ${orphanedCount} EntitySummary nodes still have no SUMMARIZES relationships`)
      
      // Get sample of orphaned summaries
      const orphanSampleResult = await neo4jService.executeQuery(`
        MATCH (s:EntitySummary)
        WHERE s.entity_id IS NOT NULL
          AND NOT EXISTS((s)-[:SUMMARIZES]->())
        RETURN s.entity_id, s.entity_type
        LIMIT 5
      `, {})
      
      console.log('Sample orphaned summaries:')
      orphanSampleResult.records.forEach(record => {
        console.log(`  - Entity ID: ${record['s.entity_id']}, Type: ${record['s.entity_type']}`)
      })
    }
    
    console.log('\n✅ Relationship fix completed!')
    
  } catch (error) {
    console.error('Error fixing relationships:', error)
  } finally {
    console.log('\n✅ Script completed')
  }
}

// Run the script
fixSummarizesRelationships().catch(console.error)