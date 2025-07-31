#!/usr/bin/env tsx
import { config } from 'dotenv'
config({ path: '.env.local' })

import { neo4jService } from '../src/lib/neo4j/service'

async function cleanupOldRelationships() {
  console.log('🧹 Cleaning Up Old RELATES_TO Relationships...\n')

  try {
    await neo4jService.initialize()
    
    // Check current state
    const checkResult = await neo4jService.executeQuery(`
      MATCH (m:Memory)-[r:RELATES_TO]-(c:CodeEntity)
      RETURN COUNT(r) as count
    `, {})
    
    const oldCount = checkResult.records[0]?.count?.toNumber() || 0
    console.log(`Found ${oldCount} old RELATES_TO relationships to clean up`)

    if (oldCount > 0) {
      console.log('\n🗑️  Deleting old RELATES_TO relationships...')
      
      const deleteResult = await neo4jService.executeQuery(`
        MATCH (m:Memory)-[r:RELATES_TO]-(c:CodeEntity)
        DELETE r
        RETURN COUNT(r) as deleted
      `, {})
      
      console.log(`Deleted ${deleteResult.records[0]?.deleted?.toNumber() || 0} relationships`)
    }

    // Verify final state
    console.log('\n📊 Final Memory-Code Relationship Counts:')
    console.log('─'.repeat(80))
    
    const finalResults = await neo4jService.executeQuery(`
      MATCH (m:Memory)-[r:REFERENCES_CODE]->(c:CodeEntity)
      WITH COUNT(r) as refCount
      MATCH (c2:CodeEntity)-[r2:DISCUSSED_IN]->(m2:Memory)
      WITH refCount, COUNT(r2) as discCount
      MATCH (m3:Memory)-[r3:RELATES_TO]-(c3:CodeEntity)
      RETURN refCount, discCount, COUNT(r3) as oldCount
    `, {})
    
    const final = finalResults.records[0]
    if (final) {
      console.log(`REFERENCES_CODE: ${final.refCount?.toNumber() || 0}`)
      console.log(`DISCUSSED_IN: ${final.discCount?.toNumber() || 0}`)
      console.log(`RELATES_TO (old): ${final.oldCount?.toNumber() || 0}`)
    }

    console.log('\n✅ Cleanup complete!')

  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    console.log('\n🎯 Done!')
  }
}

cleanupOldRelationships()