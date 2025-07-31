#!/usr/bin/env tsx

import { neo4jService } from '../src/lib/neo4j/service'
import { UnifiedSearchOrchestrator } from '../src/lib/search/orchestrator'
import { SearchQuery } from '../src/lib/search/types'
import { getOwnershipFilter, getOwnershipParams } from '../src/lib/neo4j/query-patterns'
import { generateEmbedding } from '../src/lib/embeddings/generator'
import dotenv from 'dotenv'
import { resolve } from 'path'

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env.local') })

const TEST_USER_ID = '1154e8dc-ff13-4cf2-8ff0-23ad3df7e1a7'
const TEST_WORKSPACE_ID = `user:${TEST_USER_ID}`
const TEST_QUERY = "pattern"

async function debugUnifiedSearch() {
  console.log('🔍 Debug Unified Search - Comprehensive Analysis')
  console.log('=' .repeat(80))
  console.log(`Test User ID: ${TEST_USER_ID}`)
  console.log(`Test Workspace ID: ${TEST_WORKSPACE_ID}`)
  console.log(`Test Query: "${TEST_QUERY}"`)
  console.log('=' .repeat(80))

  try {
    // Step 1: Direct Neo4j Query Test
    console.log('\n📊 Step 1: Direct Neo4j Query Test')
    console.log('-'.repeat(80))
    
    // Test ownership filter generation
    const ownershipFilter = getOwnershipFilter({
      userId: TEST_USER_ID,
      workspaceId: TEST_WORKSPACE_ID,
      nodeAlias: 's'
    })
    const ownershipParams = getOwnershipParams({
      userId: TEST_USER_ID,
      workspaceId: TEST_WORKSPACE_ID
    })
    
    console.log('Ownership Filter:', ownershipFilter)
    console.log('Ownership Params:', JSON.stringify(ownershipParams, null, 2))
    
    // Test direct count query
    const countResult = await neo4jService.executeQuery(`
      MATCH (s:EntitySummary)
      WHERE ${ownershipFilter}
      RETURN count(s) as total
    `, ownershipParams)
    
    const totalCount = countResult.records?.[0]?.total || 0
    console.log(`\n✅ Total EntitySummary nodes matching ownership: ${totalCount}`)
    
    // Test with embedding check
    const withEmbeddingResult = await neo4jService.executeQuery(`
      MATCH (s:EntitySummary)
      WHERE ${ownershipFilter}
        AND s.embedding IS NOT NULL
      RETURN count(s) as total
    `, ownershipParams)
    
    const withEmbeddingCount = withEmbeddingResult.records?.[0]?.total || 0
    console.log(`✅ EntitySummary nodes with embeddings: ${withEmbeddingCount}`)
    
    // Step 2: Test Embedding Generation
    console.log('\n🧮 Step 2: Test Embedding Generation')
    console.log('-'.repeat(80))
    
    let queryEmbedding: number[] | null = null
    try {
      queryEmbedding = await generateEmbedding(TEST_QUERY)
      console.log(`✅ Generated embedding for query: ${queryEmbedding.length} dimensions`)
      console.log(`First 5 values: [${queryEmbedding.slice(0, 5).join(', ')}...]`)
    } catch (error) {
      console.error('❌ Failed to generate embedding:', error)
    }
    
    // Step 3: Test Vector Similarity Search
    if (queryEmbedding) {
      console.log('\n🔍 Step 3: Test Vector Similarity Search')
      console.log('-'.repeat(80))
      
      const vectorSearchResult = await neo4jService.executeQuery(`
        MATCH (s:EntitySummary)
        WHERE s.embedding IS NOT NULL
          AND ${ownershipFilter}
        WITH s, vector.similarity.cosine($embedding, s.embedding) as similarity
        WHERE similarity > 0.5
        RETURN s.id, s.entity_type, similarity
        ORDER BY similarity DESC
        LIMIT 10
      `, {
        ...ownershipParams,
        embedding: queryEmbedding
      })
      
      console.log(`Found ${vectorSearchResult.records.length} similar entities:`)
      vectorSearchResult.records.forEach((record, i) => {
        console.log(`  ${i + 1}. ID: ${record['s.id']}, Type: ${record['s.entity_type']}, Similarity: ${record.similarity}`)
      })
    }
    
    // Step 4: Test Strategy Execution
    console.log('\n🎯 Step 4: Test Strategy Execution')
    console.log('-'.repeat(80))
    
    const searchQuery: SearchQuery = {
      text: TEST_QUERY,
      context: {
        userId: TEST_USER_ID,
        workspaceId: TEST_WORKSPACE_ID
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
    
    // Step 5: Test Full Orchestrator
    console.log('\n🎭 Step 5: Test Full Orchestrator')
    console.log('-'.repeat(80))
    
    const orchestrator = new UnifiedSearchOrchestrator()
    const orchestratorResults = await orchestrator.search(
      {
        query: TEST_QUERY,
        filters: {},
        pagination: { limit: 10 }
      },
      {
        userId: TEST_USER_ID,
        workspaceId: TEST_WORKSPACE_ID
      }
    )
    
    console.log('Orchestrator results:')
    console.log(`  - Interpretation: ${JSON.stringify(orchestratorResults.interpretation, null, 2)}`)
    console.log(`  - Results count: ${orchestratorResults.results?.length || 0}`)
    console.log(`  - Facets: ${JSON.stringify(orchestratorResults.facets, null, 2)}`)
    
    // Step 6: Debug specific queries
    console.log('\n🐛 Step 6: Debug Specific Queries')
    console.log('-'.repeat(80))
    
    // Check if SUMMARIZES relationships exist
    const summarizesResult = await neo4jService.executeQuery(`
      MATCH (s:EntitySummary)-[:SUMMARIZES]->(entity)
      WHERE ${getOwnershipFilter({
        userId: TEST_USER_ID,
        workspaceId: TEST_WORKSPACE_ID,
        nodeAlias: 's'
      })}
      RETURN count(s) as count, labels(entity) as entityLabels
    `, ownershipParams)
    
    console.log('SUMMARIZES relationships:')
    summarizesResult.records.forEach(record => {
      console.log(`  - Count: ${record.count}, Entity Labels: ${record.entityLabels}`)
    })
    
    // Check Memory and CodeEntity nodes directly
    const directEntitiesResult = await neo4jService.executeQuery(`
      MATCH (n)
      WHERE (n:Memory OR n:CodeEntity)
        AND ${getOwnershipFilter({
          userId: TEST_USER_ID,
          workspaceId: TEST_WORKSPACE_ID,
          nodeAlias: 'n'
        })}
      RETURN labels(n)[0] as type, count(n) as count
    `, ownershipParams)
    
    console.log('\nDirect entity counts:')
    directEntitiesResult.records.forEach(record => {
      console.log(`  - ${record.type}: ${record.count}`)
    })
    
    // Check data ownership patterns
    const ownershipPatternsResult = await neo4jService.executeQuery(`
      MATCH (n)
      WHERE n:EntitySummary OR n:Memory OR n:CodeEntity
      RETURN 
        labels(n)[0] as type,
        CASE 
          WHEN n.workspace_id IS NOT NULL THEN 'has_workspace'
          WHEN n.user_id IS NOT NULL THEN 'has_user_only'
          ELSE 'no_ownership'
        END as ownership_type,
        count(n) as count
      ORDER BY type, ownership_type
    `, {})
    
    console.log('\nOwnership patterns across all data:')
    ownershipPatternsResult.records.forEach(record => {
      console.log(`  - ${record.type} (${record.ownership_type}): ${record.count}`)
    })

  } catch (error) {
    console.error('Fatal error during debugging:', error)
  } finally {
    // Neo4j service doesn't have a close method in this implementation
    console.log('\n✅ Debug script completed')
  }
}

// Run the debug script
debugUnifiedSearch().catch(console.error)