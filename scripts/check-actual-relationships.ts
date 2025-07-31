#!/usr/bin/env tsx
import { config } from 'dotenv'
config({ path: '.env.local' })

import { neo4jService } from '../src/lib/neo4j/service'

async function checkActualRelationships() {
  console.log('🔍 Checking Actual Memory-Code Relationships in Neo4j...\n')

  try {
    await neo4jService.initialize()
    
    // Check RELATES_TO relationships
    const relatesTo = await neo4jService.executeQuery(`
      MATCH (m:Memory)-[r:RELATES_TO]-(c:CodeEntity)
      RETURN COUNT(r) as count,
             COLLECT(DISTINCT r.detection_method)[0..5] as methods,
             MIN(r.similarity) as minSim,
             MAX(r.similarity) as maxSim
    `, {})
    
    console.log('📊 RELATES_TO Relationships:')
    console.log('─'.repeat(80))
    const rtRecord = relatesTo.records[0]
    if (rtRecord) {
      console.log(`Count: ${rtRecord.count?.toNumber() || 0}`)
      console.log(`Detection methods: ${rtRecord.methods?.join(', ') || 'none'}`)
      console.log(`Similarity range: ${rtRecord.minSim || 'N/A'} - ${rtRecord.maxSim || 'N/A'}`)
    }

    // Check REFERENCES_CODE relationships
    const refCode = await neo4jService.executeQuery(`
      MATCH (m:Memory)-[r:REFERENCES_CODE]->(c:CodeEntity)
      RETURN COUNT(r) as count,
             COLLECT(DISTINCT r.detection_method)[0..5] as methods
    `, {})
    
    console.log('\n📊 REFERENCES_CODE Relationships:')
    console.log('─'.repeat(80))
    const rcRecord = refCode.records[0]
    console.log(`Count: ${rcRecord?.count?.toNumber() || 0}`)

    // Check DISCUSSES relationships
    const discusses = await neo4jService.executeQuery(`
      MATCH (m:Memory)-[r:DISCUSSES]->(c:CodeEntity)
      RETURN COUNT(r) as count
    `, {})
    
    console.log('\n📊 DISCUSSES Relationships:')
    console.log('─'.repeat(80))
    console.log(`Count: ${discusses.records[0]?.count?.toNumber() || 0}`)

    // Check Pattern relationships
    const patternRels = await neo4jService.executeQuery(`
      MATCH (p:Pattern)-[r]-(e)
      WHERE e:Memory OR e:CodeEntity OR e:EntitySummary
      RETURN type(r) as relType, labels(e) as entityType, COUNT(r) as count
      ORDER BY count DESC
    `, {})
    
    console.log('\n📊 Pattern Relationships:')
    console.log('─'.repeat(80))
    if (patternRels.records.length > 0) {
      patternRels.records.forEach(record => {
        console.log(`${record.relType} -> ${record.entityType}: ${record.count?.toNumber() || 0}`)
      })
    } else {
      console.log('No pattern relationships found')
    }

    // Check why semantic matching might be failing
    console.log('\n📊 EntitySummary Embedding Status:')
    console.log('─'.repeat(80))
    const embedStatus = await neo4jService.executeQuery(`
      MATCH (e:EntitySummary)
      RETURN e.entity_type as type,
             COUNT(e) as total,
             COUNT(CASE WHEN e.embedding IS NOT NULL THEN 1 END) as withEmbedding,
             COUNT(CASE WHEN e.embedding IS NULL THEN 1 END) as withoutEmbedding
      ORDER BY type
    `, {})
    
    embedStatus.records.forEach(record => {
      console.log(`${record.type}: ${record.total?.toNumber() || 0} total, ${record.withEmbedding?.toNumber() || 0} with embedding, ${record.withoutEmbedding?.toNumber() || 0} without`)
    })

    // Sample check: Find memories and code in same project
    console.log('\n📊 Sample: Memories and Code in Same Project:')
    console.log('─'.repeat(80))
    const sampleProjects = await neo4jService.executeQuery(`
      MATCH (m:EntitySummary {entity_type: 'memory'})
      WITH m.project_name as project, COUNT(m) as memoryCount
      WHERE project IS NOT NULL AND memoryCount > 10
      WITH project, memoryCount
      MATCH (c:EntitySummary {entity_type: 'code', project_name: project})
      WITH project, memoryCount, COUNT(c) as codeCount
      RETURN project, memoryCount, codeCount
      ORDER BY memoryCount DESC
      LIMIT 5
    `, {})
    
    sampleProjects.records.forEach(record => {
      console.log(`Project: ${record.project}, Memories: ${record.memoryCount?.toNumber() || 0}, Code: ${record.codeCount?.toNumber() || 0}`)
    })

    // Check if the pattern processor query would find anything
    console.log('\n📊 Testing Pattern Processor Query:')
    console.log('─'.repeat(80))
    const testQuery = await neo4jService.executeQuery(`
      MATCH (m:EntitySummary {entity_type: 'memory'})
      WHERE m.embedding IS NOT NULL
      WITH m
      LIMIT 1
      MATCH (c:EntitySummary {entity_type: 'code', project_name: m.project_name})
      WHERE c.embedding IS NOT NULL
        AND vector.similarity.cosine(m.embedding, c.embedding) > 0.75
      RETURN m.entity_id as memoryId, c.entity_id as codeId, 
             vector.similarity.cosine(m.embedding, c.embedding) as similarity
      LIMIT 5
    `, {})
    
    if (testQuery.records.length > 0) {
      console.log('Found potential matches:')
      testQuery.records.forEach(record => {
        console.log(`Memory ${record.memoryId} <-> Code ${record.codeId}: ${record.similarity}`)
      })
    } else {
      console.log('No matches found with similarity > 0.75')
    }

  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    console.log('\n🎯 Done!')
  }
}

checkActualRelationships()