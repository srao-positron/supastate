#!/usr/bin/env npx tsx

import { IntentAnalyzer } from '../src/lib/search/intent-analyzer'

async function testAnthropicIntent() {
  console.log('Testing Anthropic Intent Analysis...\n')
  
  const analyzer = new IntentAnalyzer()
  
  const testQueries = [
    "how did I fix the auth bug yesterday",
    "show me all debugging sessions",
    "getUserProfile function implementation",
    "what was I working on last week",
    "vector embeddings similarity search"
  ]
  
  for (const query of testQueries) {
    console.log(`\nQuery: "${query}"`)
    try {
      const analysis = await analyzer.analyze(query)
      console.log('Analysis:', JSON.stringify(analysis, null, 2))
    } catch (error) {
      console.error('Error:', error)
    }
  }
}

testAnthropicIntent().catch(console.error)