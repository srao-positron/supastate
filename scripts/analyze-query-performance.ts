/**
 * Analyze query performance and index usage
 */

import { neo4jService } from '../src/lib/neo4j/service'

async function analyzeQueryPerformance() {
  console.log('\n=== Analyzing Query Performance ===')
  
  try {
    await neo4jService.initialize()
    
    // Test a simple temporal pattern query with EXPLAIN
    const explainQuery = `
      EXPLAIN
      MATCH (m1:Memory)
      WHERE m1.user_id = 'a02c3fed-3a24-442f-becc-97bac8b75e90'
        AND m1.project_name = 'supastate'
        AND m1.created_at IS NOT NULL
      WITH m1
      ORDER BY m1.created_at DESC
      LIMIT 10
      RETURN m1.id
    `
    
    console.log('\nQuery plan for temporal pattern (simplified):')
    const explainResult = await neo4jService.executeQuery(explainQuery, {})
    console.log('Plan executed')
    
    // Test index usage with PROFILE
    const profileQuery = `
      PROFILE
      MATCH (m:Memory)
      WHERE m.user_id = 'a02c3fed-3a24-442f-becc-97bac8b75e90'
        AND m.project_name = 'supastate'
      RETURN COUNT(m) as count
    `
    
    console.log('\nProfiling index usage:')
    try {
      const profileResult = await neo4jService.executeQuery(profileQuery, {})
      const count = profileResult.records[0]?.count || 0
      console.log(`Found ${count} memories`)
    } catch (error) {
      console.log('Profile error:', error instanceof Error ? error.message : error)
    }
    
    // Check what indexes are actually being used
    console.log('\nChecking index hints...')
    
    // Test vector search performance
    const vectorTestQuery = `
      MATCH (m:Memory)
      WHERE m.project_name = 'supastate'
        AND m.embedding IS NOT NULL
      RETURN m.id
      LIMIT 1
    `
    
    console.log('\nTesting vector query:')
    const start = Date.now()
    const vectorResult = await neo4jService.executeQuery(vectorTestQuery, {})
    const duration = Date.now() - start
    console.log(`Vector query took ${duration}ms, found ${vectorResult.records.length} records`)
    
    // Suggest optimizations
    console.log('\n=== Optimization Suggestions ===')
    console.log('1. Always filter by user_id or workspace_id first')
    console.log('2. Use LIMIT early in the query to reduce data processing')
    console.log('3. Avoid complex aggregations without filtering first')
    console.log('4. Use separate queries for different pattern types')
    console.log('5. Consider using db.index.fulltext.queryNodes for text search')
    
  } catch (error) {
    console.error('Analysis failed:', error)
  }
}

analyzeQueryPerformance().catch(console.error)