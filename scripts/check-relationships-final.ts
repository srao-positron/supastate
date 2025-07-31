#!/usr/bin/env tsx
import { config } from 'dotenv'
config({ path: '.env.local' })

import { neo4jService } from '../src/lib/neo4j/service'

async function checkRelationshipsFinal() {
  console.log('🔍 Checking Final Relationship Status...\n')

  try {
    await neo4jService.initialize()
    
    // Check Pattern nodes
    const patternResult = await neo4jService.executeQuery(`
      MATCH (p:Pattern)
      RETURN COUNT(p) as count, 
             COUNT(DISTINCT p.type) as types,
             COLLECT(DISTINCT p.type)[0..5] as sampleTypes
    `, {})
    
    console.log('📊 Pattern Nodes:')
    console.log('─'.repeat(80))
    const pRecord = patternResult.records[0]
    console.log(`Total: ${pRecord?.count?.toNumber() || 0}`)
    console.log(`Types: ${pRecord?.sampleTypes?.join(', ') || 'none'}`)

    // Check Pattern relationships
    const patternRelResult = await neo4jService.executeQuery(`
      MATCH (p:Pattern)-[r]-(e)
      RETURN type(r) as relType, 
             labels(e) as entityLabels, 
             COUNT(r) as count
      ORDER BY count DESC
    `, {})
    
    console.log('\n📊 Pattern Relationships:')
    console.log('─'.repeat(80))
    if (patternRelResult.records.length > 0) {
      patternRelResult.records.forEach(record => {
        console.log(`${record.relType} -> ${record.entityLabels}: ${record.count?.toNumber() || 0}`)
      })
    } else {
      console.log('No pattern relationships found')
    }

    // Check memory-code relationships
    console.log('\n📊 Memory-Code Relationships:')
    console.log('─'.repeat(80))
    
    // RELATES_TO (old)
    const relatesToResult = await neo4jService.executeQuery(`
      MATCH (m:Memory)-[r:RELATES_TO]-(c:CodeEntity)
      RETURN COUNT(r) as count
    `, {})
    console.log(`RELATES_TO: ${relatesToResult.records[0]?.count?.toNumber() || 0}`)
    
    // REFERENCES_CODE (new)
    const refCodeResult = await neo4jService.executeQuery(`
      MATCH (m:Memory)-[r:REFERENCES_CODE]->(c:CodeEntity)
      RETURN COUNT(r) as count
    `, {})
    console.log(`REFERENCES_CODE: ${refCodeResult.records[0]?.count?.toNumber() || 0}`)
    
    // DISCUSSED_IN (new)
    const discussedResult = await neo4jService.executeQuery(`
      MATCH (c:CodeEntity)-[r:DISCUSSED_IN]->(m:Memory)
      RETURN COUNT(r) as count
    `, {})
    console.log(`DISCUSSED_IN: ${discussedResult.records[0]?.count?.toNumber() || 0}`)

    // Sample pattern with relationships
    console.log('\n📊 Sample Pattern with Relationships:')
    console.log('─'.repeat(80))
    const samplePattern = await neo4jService.executeQuery(`
      MATCH (p:Pattern)
      OPTIONAL MATCH (p)-[r1:FOUND_IN]->(e:EntitySummary)
      OPTIONAL MATCH (p)-[r2:DERIVED_FROM]->(entity)
      WITH p, COUNT(r1) as foundInCount, COUNT(r2) as derivedFromCount
      WHERE foundInCount > 0 OR derivedFromCount > 0
      RETURN p.type as type, p.name as name, foundInCount, derivedFromCount
      LIMIT 5
    `, {})
    
    if (samplePattern.records.length > 0) {
      samplePattern.records.forEach(record => {
        console.log(`Pattern: ${record.type}/${record.name}`)
        console.log(`  FOUND_IN: ${record.foundInCount?.toNumber() || 0} EntitySummaries`)
        console.log(`  DERIVED_FROM: ${record.derivedFromCount?.toNumber() || 0} entities`)
      })
    } else {
      console.log('No patterns with relationships found')
    }

  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    console.log('\n🎯 Done!')
  }
}

checkRelationshipsFinal()