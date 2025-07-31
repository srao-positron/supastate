#!/usr/bin/env npx tsx

import { createServiceClient } from '../src/lib/supabase/server'
import { neo4jService } from '../src/lib/neo4j/service'

async function testUnifiedSearch() {
  console.log('Testing Unified Search API...\n')

  // Test queries designed to trigger different strategies
  const testQueries = [
    {
      name: "Semantic Search - Technical concept",
      query: {
        query: "vector embeddings similarity search",
        filters: {
          includeMemories: true,
          includeCode: true
        }
      }
    },
    {
      name: "Temporal Search - Recent work",
      query: {
        query: "what did I work on yesterday",
        filters: {
          includeMemories: true,
          includeCode: true
        }
      }
    },
    {
      name: "Pattern Search - Debugging sessions",
      query: {
        query: "show me all debugging sessions this week",
        filters: {
          includeMemories: true,
          includeCode: false
        }
      }
    },
    {
      name: "Code-Linked Search - Cross-domain",
      query: {
        query: "auth middleware implementations",
        filters: {
          includeMemories: true,
          includeCode: true
        }
      }
    },
    {
      name: "Keyword Search - Specific terms",
      query: {
        query: "RELATES_TO relationship",
        filters: {
          includeMemories: true,
          includeCode: true
        }
      }
    },
    {
      name: "Multi-strategy - Complex query",
      query: {
        query: "how did I fix the pattern detection bug last week",
        filters: {
          includeMemories: true,
          includeCode: true
        }
      }
    }
  ]

  try {
    // Get user info
    const supabase = await createServiceClient()
    const { data: { users } } = await supabase.auth.admin.listUsers()
    const testUser = users[0]
    
    if (!testUser) {
      console.error('No users found in database')
      return
    }

    console.log(`Using test user: ${testUser.email}\n`)

    // Get user's team context
    const { data: profile } = await supabase
      .from('profiles')
      .select('team_id')
      .eq('id', testUser.id)
      .single()

    // Test each query
    for (const test of testQueries) {
      console.log(`\n=== ${test.name} ===`)
      console.log(`Query: "${test.query.query}"`)
      
      try {
        // For local testing, use direct API call
        const { UnifiedSearchOrchestrator } = await import('../src/lib/search/orchestrator')
        const orchestrator = new UnifiedSearchOrchestrator()
        
        const context = {
          userId: testUser.id,
          workspaceId: profile?.team_id ? `team:${profile.team_id}` : `user:${testUser.id}`,
          teamId: profile?.team_id
        }
        
        const result = await orchestrator.search(test.query, context)
        
        console.log(`\n📊 Intent: ${result.interpretation.intent}`)
        console.log(`🔍 Strategies: ${result.interpretation.searchStrategies.join(', ')}`)
        console.log(`📝 Total results: ${result.results.length}`)
        
        if (result.results.length > 0) {
          console.log('\n🔝 Top 3 results:')
          result.results.slice(0, 3).forEach((r: any, i: number) => {
            console.log(`\n${i + 1}. [${r.type.toUpperCase()}] ${r.content.title}`)
            console.log(`   Score: ${r.metadata.score.toFixed(3)} | Match: ${r.metadata.matchType}`)
            
            // Show highlights
            if (r.content.highlights.length > 0) {
              console.log(`   Highlights:`)
              r.content.highlights.slice(0, 2).forEach((h: string) => {
                const clean = h.replace(/<\/?mark>/g, '**')
                console.log(`     • ${clean.substring(0, 80)}${clean.length > 80 ? '...' : ''}`)
              })
            }
            
            // Show relationships
            const relMemories = r.relationships.memories?.length || 0
            const relCode = r.relationships.code?.length || 0
            const relPatterns = r.relationships.patterns?.length || 0
            
            if (relMemories + relCode + relPatterns > 0) {
              console.log(`   Related:`)
              if (relMemories > 0) console.log(`     • ${relMemories} memories`)
              if (relCode > 0) console.log(`     • ${relCode} code files`)
              if (relPatterns > 0) console.log(`     • ${relPatterns} patterns`)
            }
          })
        } else {
          console.log('\n❌ No results found')
        }
        
        // Show facets
        if (result.facets && result.results.length > 0) {
          console.log('\n📊 Facets:')
          if (result.facets.resultTypes.length > 0) {
            console.log('  Types:', result.facets.resultTypes.map((f: any) => `${f.value}(${f.count})`).join(', '))
          }
          if (result.facets.projects.length > 0) {
            console.log('  Projects:', result.facets.projects.slice(0, 3).map((f: any) => `${f.value}(${f.count})`).join(', '))
          }
          if (result.facets.languages.length > 0) {
            console.log('  Languages:', result.facets.languages.map((f: any) => `${f.value}(${f.count})`).join(', '))
          }
        }
        
      } catch (error) {
        console.error(`Test failed: ${error}`)
      }
    }

  } catch (error) {
    console.error('Test setup failed:', error)
  } finally {
    // Close Neo4j connection
    await neo4jService.close()
    console.log('\n✅ Test completed!')
  }
}

// Run the test
testUnifiedSearch().catch(console.error)