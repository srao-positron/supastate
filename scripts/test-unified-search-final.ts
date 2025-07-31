#!/usr/bin/env tsx

import dotenv from 'dotenv'
import { resolve } from 'path'

// Load environment variables FIRST
dotenv.config({ path: resolve(__dirname, '../.env.local') })

// Now import after env is loaded
import { UnifiedSearchOrchestrator } from '../src/lib/search/orchestrator'

const ACTUAL_USER_ID = 'a02c3fed-3a24-442f-becc-97bac8b75e90'
const ACTUAL_WORKSPACE_ID = `user:${ACTUAL_USER_ID}`

async function testUnifiedSearch() {
  console.log('🔍 Testing Unified Search After Fixes')
  console.log('=' .repeat(80))
  console.log(`User ID: ${ACTUAL_USER_ID}`)
  console.log(`Workspace ID: ${ACTUAL_WORKSPACE_ID}`)
  console.log('=' .repeat(80))
  
  try {
    const orchestrator = new UnifiedSearchOrchestrator()
    
    // Test searches
    const testQueries = [
      'pattern',
      'debug',
      'memory',
      'code',
      'function'
    ]
    
    for (const query of testQueries) {
      console.log(`\n🔍 Testing query: "${query}"`)
      console.log('-'.repeat(80))
      
      const startTime = Date.now()
      
      try {
        const results = await orchestrator.search(
          {
            query,
            filters: {},
            pagination: { limit: 5 }
          },
          {
            userId: ACTUAL_USER_ID,
            workspaceId: ACTUAL_WORKSPACE_ID
          }
        )
        
        const elapsed = Date.now() - startTime
        
        console.log(`✅ Search completed in ${elapsed}ms`)
        console.log(`Found ${results.results?.length || 0} results`)
        console.log(`Interpretation:`, results.interpretation)
        
        if (results.results && results.results.length > 0) {
          console.log('\nFirst result:')
          const first = results.results[0]
          console.log(`  - Type: ${first.type}`)
          console.log(`  - Title: ${first.content.title}`)
          console.log(`  - Score: ${first.metadata.score}`)
          console.log(`  - Match Type: ${first.metadata.matchType}`)
          console.log(`  - Snippet: ${first.content.snippet.substring(0, 100)}...`)
          
          if (first.relationships) {
            console.log(`  - Related memories: ${first.relationships.memories?.length || 0}`)
            console.log(`  - Related code: ${first.relationships.code?.length || 0}`)
            console.log(`  - Related patterns: ${first.relationships.patterns?.length || 0}`)
          }
        }
        
        if (results.facets) {
          console.log('\nFacets:')
          console.log(`  - Projects: ${results.facets.projects?.length || 0}`)
          console.log(`  - Languages: ${results.facets.languages?.length || 0}`)
          console.log(`  - Result types: ${results.facets.resultTypes?.length || 0}`)
        }
        
      } catch (error) {
        console.error(`❌ Error searching for "${query}":`, error)
      }
    }
    
    // Test with filters
    console.log(`\n\n🔍 Testing with filters`)
    console.log('-'.repeat(80))
    
    const filteredResults = await orchestrator.search(
      {
        query: 'code',
        filters: {
          includeMemories: false,
          includeCode: true
        },
        pagination: { limit: 5 }
      },
      {
        userId: ACTUAL_USER_ID,
        workspaceId: ACTUAL_WORKSPACE_ID
      }
    )
    
    console.log(`Found ${filteredResults.results?.length || 0} code-only results`)
    
  } catch (error) {
    console.error('Fatal error:', error)
  } finally {
    console.log('\n✅ Test completed')
  }
}

// Run the test
testUnifiedSearch().catch(console.error)