#!/usr/bin/env tsx
import { config } from 'dotenv'
config({ path: '.env.local' })

import { neo4jService } from '../src/lib/neo4j/service'
import { getOwnershipFilter, getOwnershipParams } from '../src/lib/neo4j/query-patterns'

async function testOwnershipFix() {
  console.log('🔍 Testing Ownership Filter Fix...\n')

  try {
    await neo4jService.initialize()
    
    const userId = 'a02c3fed-3a24-442f-becc-97bac8b75e90'
    
    // Test without team (personal workspace)
    console.log('📊 Test 1: User without team (personal workspace)')
    const personalFilter = getOwnershipFilter({ userId, nodeAlias: 'm' })
    const personalParams = getOwnershipParams({ userId })
    
    console.log('Filter:', personalFilter)
    console.log('Params:', personalParams)
    
    const personalResult = await neo4jService.executeQuery(`
      MATCH (m:Memory)
      WHERE ${personalFilter}
      RETURN COUNT(m) as count
    `, personalParams)
    
    console.log('Memory count:', personalResult.records[0]?.count?.toNumber() || 0)
    
    // Test with team
    console.log('\n📊 Test 2: User with team')
    const teamId = 'test-team-id'
    const workspaceId = `team:${teamId}`
    const teamFilter = getOwnershipFilter({ userId, workspaceId, teamId, nodeAlias: 'm' })
    const teamParams = getOwnershipParams({ userId, workspaceId, teamId })
    
    console.log('Filter:', teamFilter)
    console.log('Params:', teamParams)
    
    // Sample query to show what data matches
    console.log('\n📊 Test 3: Sample data')
    const sampleResult = await neo4jService.executeQuery(`
      MATCH (m:Memory)
      WHERE ${personalFilter}
      RETURN m.workspace_id as workspace_id, m.user_id as user_id, m.team_id as team_id
      LIMIT 5
    `, personalParams)
    
    console.log('Sample memories:')
    sampleResult.records.forEach((record, i) => {
      console.log(`  ${i + 1}. workspace_id: ${record.workspace_id}, user_id: ${record.user_id}, team_id: ${record.team_id}`)
    })

  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    console.log('\n✅ Test complete!')
  }
}

testOwnershipFix()