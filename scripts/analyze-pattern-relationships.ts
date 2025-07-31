#!/usr/bin/env tsx
import { config } from 'dotenv'
config({ path: '.env.local' })

import { neo4jService } from '../src/lib/neo4j/service'

async function analyzePatternRelationships() {
  console.log('🔍 Analyzing Pattern Relationships...\n')

  try {
    await neo4jService.initialize()
    
    // Check pattern nodes
    const patternResult = await neo4jService.executeQuery(`
      MATCH (p:Pattern)
      RETURN p.type as type, p.name as name, p.id as id
      LIMIT 10
    `, {})
    
    console.log('📊 Sample Patterns:')
    console.log('─'.repeat(80))
    patternResult.records.forEach(record => {
      console.log(`Type: ${record.type}, Name: ${record.name}`)
      console.log(`ID: ${record.id}`)
      console.log()
    })

    // Check pattern relationships
    const relationshipResult = await neo4jService.executeQuery(`
      MATCH (p:Pattern)
      OPTIONAL MATCH (p)-[r]->(e)
      WITH p, type(r) as relType, labels(e) as entityLabels, COUNT(e) as count
      RETURN p.type as patternType, relType, entityLabels, count
      ORDER BY count DESC
      LIMIT 20
    `, {})
    
    console.log('📊 Pattern Relationships:')
    console.log('─'.repeat(80))
    relationshipResult.records.forEach(record => {
      console.log(`Pattern: ${record.patternType}, Relationship: ${record.relType}, Target: ${record.entityLabels}, Count: ${record.count?.toNumber() || 0}`)
    })

    // Check if patterns are connected to memories or code
    const connectionResult = await neo4jService.executeQuery(`
      MATCH (p:Pattern)
      OPTIONAL MATCH (p)-[:FOUND_IN|DERIVED_FROM|BASED_ON]->(m:Memory)
      OPTIONAL MATCH (p)-[:FOUND_IN|DERIVED_FROM|BASED_ON]->(c:CodeEntity)
      WITH p, COUNT(DISTINCT m) as memoryCount, COUNT(DISTINCT c) as codeCount
      RETURN p.type as type, memoryCount, codeCount
      ORDER BY memoryCount + codeCount DESC
    `, {})
    
    console.log('\n📊 Pattern-Entity Connections:')
    console.log('─'.repeat(80))
    connectionResult.records.forEach(record => {
      console.log(`Pattern Type: ${record.type}`)
      console.log(`  Connected to Memories: ${record.memoryCount?.toNumber() || 0}`)
      console.log(`  Connected to Code: ${record.codeCount?.toNumber() || 0}`)
    })

    // Check code-memory relationships
    const codeMemoryResult = await neo4jService.executeQuery(`
      MATCH (m:Memory)
      OPTIONAL MATCH (m)-[r:REFERENCES_CODE|DISCUSSES]->(c:CodeEntity)
      WITH COUNT(DISTINCT m) as totalMemories, 
           COUNT(DISTINCT CASE WHEN r IS NOT NULL THEN m END) as memoriesWithCode,
           COUNT(r) as totalRelationships
      RETURN totalMemories, memoriesWithCode, totalRelationships
    `, {})
    
    console.log('\n📊 Code-Memory Relationships:')
    console.log('─'.repeat(80))
    const cmRecord = codeMemoryResult.records[0]
    console.log(`Total Memories: ${cmRecord.totalMemories?.toNumber() || 0}`)
    console.log(`Memories with Code Links: ${cmRecord.memoriesWithCode?.toNumber() || 0}`)
    console.log(`Total Code-Memory Relationships: ${cmRecord.totalRelationships?.toNumber() || 0}`)

    // Sample some actual relationships
    const sampleRelResult = await neo4jService.executeQuery(`
      MATCH (m:Memory)-[r:REFERENCES_CODE|DISCUSSES]->(c:CodeEntity)
      RETURN m.content as memoryContent, type(r) as relType, c.name as codeName, c.path as codePath
      LIMIT 5
    `, {})
    
    if (sampleRelResult.records.length > 0) {
      console.log('\n📊 Sample Code-Memory Relationships:')
      console.log('─'.repeat(80))
      sampleRelResult.records.forEach((record, i) => {
        console.log(`${i + 1}. Memory: "${record.memoryContent?.substring(0, 100)}..."`)
        console.log(`   Relationship: ${record.relType}`)
        console.log(`   Code: ${record.codeName} (${record.codePath})`)
        console.log()
      })
    }

  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    console.log('\n🎯 Done!')
  }
}

analyzePatternRelationships()