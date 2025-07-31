#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { resolve } from 'path'
import { UnifiedSearchOrchestrator } from '../src/lib/search/orchestrator'

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') })

async function testResultStructure() {
  const orchestrator = new UnifiedSearchOrchestrator()
  
  const context = {
    userId: 'a02c3fed-3a24-442f-becc-97bac8b75e90',
    workspaceId: 'user:a02c3fed-3a24-442f-becc-97bac8b75e90',
    teamId: undefined
  }

  console.log('Testing unified search result structure...\n')

  const results = await orchestrator.search({
    query: 'debug',
    includeMemories: true,
    includeCode: true,
    limit: 2
  }, context)

  console.log(`Found ${results.results?.length || 0} results\n`)
  
  if (results.results && results.results.length > 0) {
    const first = results.results[0]
    console.log('First result structure:')
    console.log('- id:', first.id)
    console.log('- type:', first.type)
    console.log('- contentUrl:', first.contentUrl)
    console.log('- content:', {
      title: first.content?.title,
      snippet: first.content?.snippet?.substring(0, 50) + '...',
      highlightsCount: first.content?.highlights?.length
    })
    console.log('- relationships:', {
      memories: first.relationships?.memories?.length || 0,
      code: first.relationships?.code?.length || 0,
      patterns: first.relationships?.patterns?.length || 0
    })
    console.log('\nFull result structure:')
    console.log(JSON.stringify(first, null, 2))
  }
}

testResultStructure().catch(console.error)