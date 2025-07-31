#!/usr/bin/env npx tsx

import { neo4jService } from '../src/lib/neo4j/service'
import { createServiceClient } from '../src/lib/supabase/server'
import { getOwnershipFilter, getOwnershipParams } from '../src/lib/neo4j/query-patterns'

async function checkSearchData() {
  console.log('Checking data available for search...\n')
  
  try {
    // Get user info
    const supabase = await createServiceClient()
    const { data: { users } } = await supabase.auth.admin.listUsers()
    const testUser = users[0]
    
    if (!testUser) {
      console.error('No users found')
      return
    }
    
    console.log(`User: ${testUser.email} (${testUser.id})\n`)
    
    // Get user's team context
    const { data: profile } = await supabase
      .from('profiles')
      .select('team_id')
      .eq('id', testUser.id)
      .single()
    
    const context = {
      userId: testUser.id,
      workspaceId: profile?.team_id ? `team:${profile.team_id}` : `user:${testUser.id}`,
      teamId: profile?.team_id
    }
    
    console.log('Context:', context)
    console.log('\n--- CHECKING DATA ---\n')
    
    // Check EntitySummary nodes (used for semantic search)
    const summaryResult = await neo4jService.executeQuery(`
      MATCH (s:EntitySummary)
      WHERE ${getOwnershipFilter(context)}
      RETURN 
        count(s) as total,
        count(CASE WHEN s.embedding IS NOT NULL THEN 1 END) as withEmbeddings
    `, getOwnershipParams(context))
    
    const summaryCount = summaryResult.records[0]
    console.log(`EntitySummary nodes: ${summaryCount.get('total')} (${summaryCount.get('withEmbeddings')} with embeddings)`)
    
    // Check Memory nodes
    const memoryResult = await neo4jService.executeQuery(`
      MATCH (m:Memory)
      WHERE ${getOwnershipFilter({ ...context, nodeAlias: 'm' })}
      RETURN count(m) as total
    `, getOwnershipParams(context))
    
    console.log(`Memory nodes: ${memoryResult.records[0].get('total')}`)
    
    // Check CodeEntity nodes
    const codeResult = await neo4jService.executeQuery(`
      MATCH (c:CodeEntity)
      WHERE ${getOwnershipFilter({ ...context, nodeAlias: 'c' })}
      RETURN count(c) as total
    `, getOwnershipParams(context))
    
    console.log(`CodeEntity nodes: ${codeResult.records[0].get('total')}`)
    
    // Check Pattern nodes
    const patternResult = await neo4jService.executeQuery(`
      MATCH (p:Pattern)
      WHERE ${getOwnershipFilter({ ...context, nodeAlias: 'p' })}
      RETURN p.type as type, count(p) as count
      ORDER BY count DESC
    `, getOwnershipParams(context))
    
    console.log('\nPattern types:')
    patternResult.records.forEach(record => {
      console.log(`  ${record.get('type')}: ${record.get('count')}`)
    })
    
    // Check relationships
    const relResult = await neo4jService.executeQuery(`
      MATCH (m:Memory)-[r:REFERENCES_CODE|DISCUSSED_IN]-(c:CodeEntity)
      WHERE ${getOwnershipFilter({ ...context, nodeAlias: 'm' })}
      RETURN type(r) as relType, count(r) as count
    `, getOwnershipParams(context))
    
    console.log('\nMemory-Code relationships:')
    relResult.records.forEach(record => {
      console.log(`  ${record.get('relType')}: ${record.get('count')}`)
    })
    
    // Sample memory content
    console.log('\n--- SAMPLE DATA ---\n')
    
    const sampleMemory = await neo4jService.executeQuery(`
      MATCH (m:Memory)
      WHERE ${getOwnershipFilter({ ...context, nodeAlias: 'm' })}
        AND m.content IS NOT NULL
      RETURN m.content as content, m.occurred_at as date
      ORDER BY m.occurred_at DESC
      LIMIT 3
    `, getOwnershipParams(context))
    
    console.log('Recent memories:')
    sampleMemory.records.forEach((record, i) => {
      const content = record.get('content')
      const date = record.get('date')
      console.log(`\n${i + 1}. ${date}`)
      console.log(`   ${content.substring(0, 100)}...`)
    })
    
    // Sample code
    const sampleCode = await neo4jService.executeQuery(`
      MATCH (c:CodeEntity)
      WHERE ${getOwnershipFilter({ ...context, nodeAlias: 'c' })}
        AND c.path IS NOT NULL
      RETURN c.path as path, c.language as lang
      LIMIT 5
    `, getOwnershipParams(context))
    
    console.log('\n\nSample code files:')
    sampleCode.records.forEach(record => {
      console.log(`  ${record.get('path')} (${record.get('lang')})`)
    })
    
  } catch (error) {
    console.error('Error checking data:', error)
  } finally {
    await neo4jService.close()
  }
}

checkSearchData().catch(console.error)