#!/usr/bin/env tsx

import { neo4jService } from '../src/lib/neo4j/service'
import { UnifiedSearchOrchestrator } from '../src/lib/search/orchestrator'
import { SearchQuery } from '../src/lib/search/types'
import { getOwnershipFilter, getOwnershipParams } from '../src/lib/neo4j/query-patterns'
import dotenv from 'dotenv'
import { resolve } from 'path'

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env.local') })

// The actual user with data
const ACTUAL_USER_ID = 'a02c3fed-3a24-442f-becc-97bac8b75e90'
const ACTUAL_WORKSPACE_ID = `user:${ACTUAL_USER_ID}`
const TEST_QUERY = "pattern"

// Mock OpenAI embedding for testing
const MOCK_EMBEDDING = new Array(3072).fill(0).map(() => Math.random() * 2 - 1)

async function debugSearchForActualUser() {
  console.log('🔍 Debug Unified Search - Testing with Actual User Data')
  console.log('=' .repeat(80))
  console.log(`User ID: ${ACTUAL_USER_ID}`)
  console.log(`Workspace ID: ${ACTUAL_WORKSPACE_ID}`)
  console.log(`Test Query: "${TEST_QUERY}"`)
  console.log('=' .repeat(80))

  try {
    // Step 1: Verify User Has Data
    console.log('\n📊 Step 1: Verify User Has Data')
    console.log('-'.repeat(80))
    
    const ownershipFilter = getOwnershipFilter({
      userId: ACTUAL_USER_ID,
      workspaceId: ACTUAL_WORKSPACE_ID,
      nodeAlias: 's'
    })
    const ownershipParams = getOwnershipParams({
      userId: ACTUAL_USER_ID,
      workspaceId: ACTUAL_WORKSPACE_ID
    })
    
    console.log('Ownership Filter:', ownershipFilter)
    console.log('Ownership Params:', JSON.stringify(ownershipParams, null, 2))
    
    // Count EntitySummary nodes
    const countResult = await neo4jService.executeQuery(`
      MATCH (s:EntitySummary)
      WHERE ${ownershipFilter}
      RETURN count(s) as total
    `, ownershipParams)
    
    const totalCount = countResult.records?.[0]?.total || 0
    console.log(`\n✅ Total EntitySummary nodes: ${totalCount}`)
    
    // Count with embeddings
    const withEmbeddingResult = await neo4jService.executeQuery(`
      MATCH (s:EntitySummary)
      WHERE ${ownershipFilter}
        AND s.embedding IS NOT NULL
      RETURN count(s) as total
    `, ownershipParams)
    
    const withEmbeddingCount = withEmbeddingResult.records?.[0]?.total || 0
    console.log(`✅ EntitySummary nodes with embeddings: ${withEmbeddingCount}`)
    
    // Step 2: Test Direct Vector Search with Mock Embedding
    console.log('\n🔍 Step 2: Test Direct Vector Search (Mock Embedding)')
    console.log('-'.repeat(80))
    
    const vectorSearchResult = await neo4jService.executeQuery(`
      MATCH (s:EntitySummary)
      WHERE s.embedding IS NOT NULL
        AND ${ownershipFilter}
      WITH s, vector.similarity.cosine($embedding, s.embedding) as similarity
      WHERE similarity > 0.3  // Lower threshold for testing
      RETURN s.id, s.entity_type, similarity, s.content
      ORDER BY similarity DESC
      LIMIT 5
    `, {
      ...ownershipParams,
      embedding: MOCK_EMBEDDING
    })
    
    console.log(`Found ${vectorSearchResult.records.length} similar entities with mock embedding`)
    vectorSearchResult.records.forEach((record, i) => {
      console.log(`  ${i + 1}. ID: ${record['s.id']}, Type: ${record['s.entity_type']}, Similarity: ${record.similarity}`)
    })
    
    // Step 3: Test SUMMARIZES Relationships
    console.log('\n🔗 Step 3: Test SUMMARIZES Relationships')
    console.log('-'.repeat(80))
    
    const summarizesResult = await neo4jService.executeQuery(`
      MATCH (s:EntitySummary)-[:SUMMARIZES]->(entity)
      WHERE ${getOwnershipFilter({
        userId: ACTUAL_USER_ID,
        workspaceId: ACTUAL_WORKSPACE_ID,
        nodeAlias: 's'
      })}
      RETURN count(s) as count, labels(entity) as entityLabels
      LIMIT 10
    `, ownershipParams)
    
    console.log('SUMMARIZES relationships:')
    if (summarizesResult.records.length === 0) {
      console.log('  ❌ No SUMMARIZES relationships found!')
    } else {
      summarizesResult.records.forEach(record => {
        console.log(`  - Count: ${record.count}, Entity Labels: ${record.entityLabels}`)
      })
    }
    
    // Step 4: Test Direct Memory/Code Search
    console.log('\n📚 Step 4: Test Direct Memory/Code Search')
    console.log('-'.repeat(80))
    
    const directSearchResult = await neo4jService.executeQuery(`
      MATCH (n)
      WHERE (n:Memory OR n:CodeEntity)
        AND ${getOwnershipFilter({
          userId: ACTUAL_USER_ID,
          workspaceId: ACTUAL_WORKSPACE_ID,
          nodeAlias: 'n'
        })}
        AND n.content =~ '(?i).*${TEST_QUERY}.*'
      RETURN n.id, labels(n)[0] as type, n.content
      LIMIT 5
    `, ownershipParams)
    
    console.log(`Direct text search found ${directSearchResult.records.length} matches:`)
    directSearchResult.records.forEach((record, i) => {
      const content = record['n.content']?.substring(0, 100) + '...'
      console.log(`  ${i + 1}. ${record.type} (${record['n.id']}): ${content}`)
    })
    
    // Step 5: Test Search Strategies with Mock
    console.log('\n🎯 Step 5: Test Search Strategies (Mock Embedding)')
    console.log('-'.repeat(80))
    
    // Mock the embedding generator to avoid API calls
    const originalGenerateEmbedding = require('../src/lib/embeddings/generator').generateEmbedding
    require('../src/lib/embeddings/generator').generateEmbedding = async () => MOCK_EMBEDDING
    
    const searchQuery: SearchQuery = {
      text: TEST_QUERY,
      context: {
        userId: ACTUAL_USER_ID,
        workspaceId: ACTUAL_WORKSPACE_ID
      },
      limit: 10
    }
    
    // Test Semantic Strategy
    console.log('\n📡 Testing Semantic Search Strategy:')
    const { SemanticSearchStrategy } = await import('../src/lib/search/strategies/semantic')
    const semanticStrategy = new SemanticSearchStrategy()
    
    try {
      const semanticResults = await semanticStrategy.execute(searchQuery)
      console.log(`✅ Semantic strategy returned ${semanticResults.length} results`)
      if (semanticResults.length > 0) {
        console.log('First result:', JSON.stringify(semanticResults[0], null, 2))
      }
    } catch (error) {
      console.error('❌ Semantic strategy error:', error)
    }
    
    // Test Keyword Strategy
    console.log('\n🔤 Testing Keyword Search Strategy:')
    const { KeywordSearchStrategy } = await import('../src/lib/search/strategies/keyword')
    const keywordStrategy = new KeywordSearchStrategy()
    
    try {
      const keywordResults = await keywordStrategy.execute(searchQuery)
      console.log(`✅ Keyword strategy returned ${keywordResults.length} results`)
      if (keywordResults.length > 0) {
        console.log('First result:', JSON.stringify(keywordResults[0], null, 2))
      }
    } catch (error) {
      console.error('❌ Keyword strategy error:', error)
    }
    
    // Restore original embedding generator
    require('../src/lib/embeddings/generator').generateEmbedding = originalGenerateEmbedding
    
    // Step 6: Debug Why Strategies Return 0 Results
    console.log('\n🐛 Step 6: Debug Why Strategies Return 0 Results')
    console.log('-'.repeat(80))
    
    // Check if the semantic search query is correct
    const semanticDebugQuery = `
      // Search all EntitySummary nodes (which summarize both Memory and CodeEntity)
      MATCH (s:EntitySummary)
      WHERE s.embedding IS NOT NULL
        AND ${ownershipFilter}
      WITH s, vector.similarity.cosine($embedding, s.embedding) as similarity
      WHERE similarity > 0.65
      
      // Get the actual entity (Memory or CodeEntity)
      MATCH (s)-[:SUMMARIZES]->(entity)
      WHERE (entity:Memory OR entity:CodeEntity)
      
      RETURN 
        s.id as summaryId,
        entity.id as entityId,
        labels(entity) as entityLabels,
        similarity
      LIMIT 5
    `
    
    console.log('Testing semantic search query structure:')
    const semanticDebugResult = await neo4jService.executeQuery(semanticDebugQuery, {
      ...ownershipParams,
      embedding: MOCK_EMBEDDING
    })
    
    console.log(`Semantic debug query returned ${semanticDebugResult.records.length} results`)
    if (semanticDebugResult.records.length === 0) {
      console.log('❌ Issue: No SUMMARIZES relationships found between EntitySummary and Memory/CodeEntity')
      
      // Check if EntitySummary nodes have entity_id
      const entityIdCheckResult = await neo4jService.executeQuery(`
        MATCH (s:EntitySummary)
        WHERE ${ownershipFilter}
          AND s.entity_id IS NOT NULL
        RETURN count(s) as withEntityId
      `, ownershipParams)
      
      const withEntityId = entityIdCheckResult.records?.[0]?.withEntityId || 0
      console.log(`\n EntitySummary nodes with entity_id: ${withEntityId}`)
      
      // Check if Memory/CodeEntity nodes exist with matching IDs
      const matchingEntitiesResult = await neo4jService.executeQuery(`
        MATCH (s:EntitySummary)
        WHERE ${ownershipFilter}
          AND s.entity_id IS NOT NULL
        WITH s.entity_id as entityId, s.entity_type as entityType
        LIMIT 5
        MATCH (entity)
        WHERE entity.id = entityId
          AND (entity:Memory OR entity:CodeEntity)
        RETURN entityId, labels(entity) as foundLabels, entityType as expectedType
      `, ownershipParams)
      
      console.log(`\n Checking if entities exist for EntitySummary.entity_id:`)
      if (matchingEntitiesResult.records.length === 0) {
        console.log('  ❌ No matching Memory/CodeEntity nodes found for EntitySummary.entity_id values!')
      } else {
        matchingEntitiesResult.records.forEach(record => {
          console.log(`  - Entity ${record.entityId}: Found as ${record.foundLabels}, Expected: ${record.expectedType}`)
        })
      }
    }
    
    // Step 7: Test Full Orchestrator
    console.log('\n🎭 Step 7: Test Full Orchestrator')
    console.log('-'.repeat(80))
    
    // Mock embedding generator for orchestrator
    require('../src/lib/embeddings/generator').generateEmbedding = async () => MOCK_EMBEDDING
    
    const orchestrator = new UnifiedSearchOrchestrator()
    const orchestratorResults = await orchestrator.search(
      {
        query: TEST_QUERY,
        filters: {},
        pagination: { limit: 10 }
      },
      {
        userId: ACTUAL_USER_ID,
        workspaceId: ACTUAL_WORKSPACE_ID
      }
    )
    
    console.log('Orchestrator results:')
    console.log(`  - Results count: ${orchestratorResults.results?.length || 0}`)
    console.log(`  - Interpretation:`, orchestratorResults.interpretation)
    
    // Restore original
    require('../src/lib/embeddings/generator').generateEmbedding = originalGenerateEmbedding

  } catch (error) {
    console.error('Fatal error during debugging:', error)
  } finally {
    console.log('\n✅ Debug script completed')
  }
}

// Run the debug script
debugSearchForActualUser().catch(console.error)