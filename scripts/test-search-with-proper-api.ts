#!/usr/bin/env tsx

import dotenv from 'dotenv'
import { resolve } from 'path'

// Load environment variables FIRST
dotenv.config({ path: resolve(__dirname, '../.env.local') })

// Now import after env is loaded
import { neo4jService } from '../src/lib/neo4j/service'
import { getOwnershipFilter, getOwnershipParams } from '../src/lib/neo4j/query-patterns'

const ACTUAL_USER_ID = 'a02c3fed-3a24-442f-becc-97bac8b75e90'
const ACTUAL_WORKSPACE_ID = `user:${ACTUAL_USER_ID}`
const TEST_QUERY = "pattern"

async function testSearchWithProperAPI() {
  console.log('🔍 Test Search with Proper Neo4j API')
  console.log('=' .repeat(80))
  
  try {
    // Test semantic search query structure
    const ownershipFilter = getOwnershipFilter({
      userId: ACTUAL_USER_ID,
      workspaceId: ACTUAL_WORKSPACE_ID,
      nodeAlias: 's'
    })
    const ownershipParams = getOwnershipParams({
      userId: ACTUAL_USER_ID,
      workspaceId: ACTUAL_WORKSPACE_ID
    })
    
    // First test: Direct query that mimics semantic search
    console.log('\n📊 Test 1: Semantic Search Query Structure')
    console.log('-'.repeat(80))
    
    const semanticTestQuery = `
      // First, let's see what EntitySummary nodes we have
      MATCH (s:EntitySummary)
      WHERE s.embedding IS NOT NULL
        AND ${ownershipFilter}
      
      // Get the actual entity
      MATCH (s)-[:SUMMARIZES]->(entity)
      WHERE (entity:Memory OR entity:CodeEntity)
      
      RETURN 
        entity.id as entityId,
        entity.content as content,
        s.summary as summary,
        labels(entity) as entityType,
        entity.project_name as projectName,
        entity.occurred_at as occurredAt,
        entity.path as path
      LIMIT 5
    `
    
    const testResult = await neo4jService.executeQuery(semanticTestQuery, ownershipParams)
    
    console.log(`Found ${testResult.records.length} entities through SUMMARIZES relationship`)
    testResult.records.forEach((record, i) => {
      console.log(`\n${i + 1}. Entity ${record.entityId}`)
      console.log(`   Type: ${record.entityType}`)
      console.log(`   Project: ${record.projectName}`)
      console.log(`   Content preview: ${record.content?.substring(0, 100)}...`)
    })
    
    // Test how records are returned
    if (testResult.records.length > 0) {
      const firstRecord = testResult.records[0]
      console.log('\n🔬 Record structure analysis:')
      console.log('Keys in record:', Object.keys(firstRecord))
      console.log('Type of record:', typeof firstRecord)
      console.log('Has .get method?', typeof firstRecord.get === 'function')
    }
    
    // Test keyword search
    console.log('\n📊 Test 2: Keyword Search')
    console.log('-'.repeat(80))
    
    const keywordQuery = `
      MATCH (m:Memory)
      WHERE m.content =~ '(?i).*pattern.*'
        AND ${getOwnershipFilter({ 
          userId: ACTUAL_USER_ID, 
          workspaceId: ACTUAL_WORKSPACE_ID, 
          nodeAlias: 'm' 
        })}
      RETURN 
        m.id as id,
        m.content as content,
        m.project_name as projectName,
        'Memory' as entityType
      LIMIT 5
    `
    
    const keywordResult = await neo4jService.executeQuery(keywordQuery, ownershipParams)
    console.log(`Keyword search found ${keywordResult.records.length} matches`)
    
    // Test the exact query from semantic strategy
    console.log('\n📊 Test 3: Exact Semantic Strategy Query')
    console.log('-'.repeat(80))
    
    // First, let's generate a real embedding
    try {
      const { generateEmbedding } = await import('../src/lib/embeddings/generator')
      const embedding = await generateEmbedding(TEST_QUERY)
      console.log(`✅ Generated real embedding with ${embedding.length} dimensions`)
      
      const exactSemanticQuery = `
        // Search all EntitySummary nodes (which summarize both Memory and CodeEntity)
        MATCH (s:EntitySummary)
        WHERE s.embedding IS NOT NULL
          AND ${ownershipFilter}
        WITH s, vector.similarity.cosine($embedding, s.embedding) as similarity
        WHERE similarity > 0.65
        
        // Get the actual entity (Memory or CodeEntity)
        MATCH (s)-[:SUMMARIZES]->(entity)
        WHERE (entity:Memory OR entity:CodeEntity)
        
        // Include only requested entity types based on filters
        WITH s, entity, similarity
        WHERE 
          (entity:Memory AND $includeMemories) OR 
          (entity:CodeEntity AND $includeCode)
        
        // Get relationships
        OPTIONAL MATCH (entity)-[:REFERENCES_CODE|DISCUSSED_IN]-(related)
        WHERE (related:Memory OR related:CodeEntity)
        
        // Get patterns for memories
        OPTIONAL MATCH (p:Pattern)-[:DERIVED_FROM]->(entity)
        WHERE entity:Memory
        
        // Get session info for memories
        OPTIONAL MATCH (entity)-[:IN_SESSION]->(session:Session)
        WHERE entity:Memory
        
        RETURN 
          entity,
          s.summary as summary,
          similarity,
          labels(entity) as entityType,
          collect(DISTINCT related) as relatedEntities,
          collect(DISTINCT p) as patterns,
          session
        ORDER BY similarity DESC
        LIMIT $limit
      `
      
      const exactResult = await neo4jService.executeQuery(exactSemanticQuery, {
        embedding: embedding,
        includeMemories: true,
        includeCode: true,
        limit: 10,
        ...ownershipParams
      })
      
      console.log(`Exact semantic query returned ${exactResult.records.length} results`)
      
      if (exactResult.records.length > 0) {
        const record = exactResult.records[0]
        console.log('\n🔬 First result structure:')
        console.log('Keys:', Object.keys(record))
        console.log('Entity type:', typeof record.entity)
        console.log('Entity keys:', record.entity ? Object.keys(record.entity) : 'No entity')
        
        // Check if entity has properties
        if (record.entity && record.entity.properties) {
          console.log('Entity properties keys:', Object.keys(record.entity.properties))
        }
      }
      
    } catch (error) {
      console.error('❌ Failed to generate embedding:', error)
    }
    
  } catch (error) {
    console.error('Fatal error:', error)
  } finally {
    console.log('\n✅ Test completed')
  }
}

// Run the test
testSearchWithProperAPI().catch(console.error)