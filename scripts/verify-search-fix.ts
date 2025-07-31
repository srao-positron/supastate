#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { resolve } from 'path'
import { UnifiedSearchOrchestrator } from '../src/lib/search/orchestrator'

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') })

async function verifySearchFix() {
  const orchestrator = new UnifiedSearchOrchestrator()
  
  const context = {
    userId: 'a02c3fed-3a24-442f-becc-97bac8b75e90',
    workspaceId: 'user:a02c3fed-3a24-442f-becc-97bac8b75e90',
    teamId: undefined
  }

  const queries = ['middleware', 'MCP', 'debug', 'pattern detection']

  for (const query of queries) {
    console.log(`\n🔍 Testing query: "${query}"`)
    console.log('='.repeat(50))
    
    try {
      const results = await orchestrator.search({
        query,
        includeMemories: true,
        includeCode: true,
        limit: 10
      }, context)

      console.log(`✅ Found ${results.results?.length || 0} results`)
      console.log(`📊 Intent: ${results.intent?.primaryIntent || 'unknown'}`)
      
      if (results.results && results.results.length > 0) {
        console.log('\nTop 3 results:')
        results.results.slice(0, 3).forEach((result, i) => {
          console.log(`\n${i + 1}. ${result.title || 'Untitled'}`)
          console.log(`   Type: ${result.type}`)
          console.log(`   Score: ${result.score.toFixed(3)}`)
          if (result.snippet) {
            console.log(`   Snippet: ${result.snippet.substring(0, 150)}...`)
          }
        })
      }

      // Show strategies that contributed
      if (results.metadata?.strategies) {
        console.log('\nStrategies used:')
        results.metadata.strategies.forEach((s: any) => {
          console.log(`  - ${s.name}: ${s.resultsCount} results in ${s.duration}ms`)
        })
      }
    } catch (error) {
      console.error('❌ Error:', error)
    }
  }
}

verifySearchFix().catch(console.error)