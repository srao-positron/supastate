#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { resolve } from 'path'
import { UnifiedSearchOrchestrator } from '../src/lib/search/orchestrator'

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') })

async function debugHighlights() {
  const orchestrator = new UnifiedSearchOrchestrator()
  
  const context = {
    userId: 'a02c3fed-3a24-442f-becc-97bac8b75e90',
    workspaceId: 'user:a02c3fed-3a24-442f-becc-97bac8b75e90',
    teamId: undefined
  }

  console.log('Debugging highlights issue...\n')

  const results = await orchestrator.search({
    query: 'anthropic',
    includeMemories: true,
    includeCode: true,
    limit: 3
  }, context)

  console.log(`Total results: ${results.results?.length || 0}\n`)

  if (results.results && results.results.length > 0) {
    results.results.forEach((result, idx) => {
      console.log(`\n=== Result ${idx + 1}: ${result.content.title} ===`)
      console.log(`Type: ${result.type}`)
      console.log(`Highlights count: ${result.content.highlights?.length || 0}`)
      
      if (result.content.highlights) {
        result.content.highlights.forEach((highlight, i) => {
          console.log(`\nHighlight ${i + 1}:`)
          console.log('---')
          console.log(highlight)
          console.log('---')
        })
      }
      
      console.log(`\nRelationships:`)
      console.log(`- Memories: ${result.relationships?.memories?.length || 0}`)
      console.log(`- Code: ${result.relationships?.code?.length || 0}`)
      console.log(`- Patterns: ${result.relationships?.patterns?.length || 0}`)
    })
  }
}

debugHighlights().catch(console.error)