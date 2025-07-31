#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { resolve } from 'path'
import { UnifiedSearchOrchestrator } from '../src/lib/search/orchestrator'

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') })

async function testSearch() {
  const orchestrator = new UnifiedSearchOrchestrator()
  
  const context = {
    userId: 'a02c3fed-3a24-442f-becc-97bac8b75e90',
    workspaceId: 'user:a02c3fed-3a24-442f-becc-97bac8b75e90',
    teamId: undefined
  }

  console.log('Testing unified search...\n')

  const results = await orchestrator.search({
    query: 'debug',
    includeMemories: true,
    includeCode: true,
    limit: 5
  }, context)

  console.log(`✅ Search for "debug" returned ${results.results?.length || 0} results`)
  
  if (results.results && results.results.length > 0) {
    console.log('\nFirst result:')
    const first = results.results[0]
    console.log(`- Title: ${first.title || 'Untitled'}`)
    console.log(`- Type: ${first.type}`)
    console.log(`- Score: ${first.score}`)
  }
}

testSearch().catch(console.error)