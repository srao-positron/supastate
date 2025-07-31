#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { resolve } from 'path'
import { UnifiedSearchOrchestrator } from '../src/lib/search/orchestrator'

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') })

async function debugSearchUI() {
  const orchestrator = new UnifiedSearchOrchestrator()
  
  const context = {
    userId: 'a02c3fed-3a24-442f-becc-97bac8b75e90',
    workspaceId: 'user:a02c3fed-3a24-442f-becc-97bac8b75e90',
    teamId: undefined
  }

  console.log('Debugging search UI data...\n')

  const results = await orchestrator.search({
    query: 'debug',
    includeMemories: true,
    includeCode: true,
    limit: 1
  }, context)

  if (results.results && results.results.length > 0) {
    const first = results.results[0]
    console.log('First result for debugging:')
    console.log('- Highlights count:', first.content?.highlights?.length || 0)
    console.log('- Highlights:', first.content?.highlights || [])
    console.log('- Relationships:', {
      memories: first.relationships?.memories || [],
      code: first.relationships?.code || [],
      patterns: first.relationships?.patterns || []
    })
    
    // Check if we have more than 2 highlights to test "Show More"
    if (first.content?.highlights && first.content.highlights.length > 2) {
      console.log('\n✅ This result has more than 2 highlights - Show More should work')
    } else {
      console.log('\n❌ This result has 2 or fewer highlights - Show More won\'t have effect')
    }
  }
}

debugSearchUI().catch(console.error)