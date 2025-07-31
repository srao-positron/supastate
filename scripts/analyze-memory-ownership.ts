#!/usr/bin/env tsx
import { config } from 'dotenv'
config({ path: '.env.local' })

import { neo4jService } from '../src/lib/neo4j/service'

async function analyzeMemoryOwnership() {
  console.log('🔍 Analyzing Memory Ownership Structure...\n')

  try {
    await neo4jService.initialize()
    
    const userId = 'a02c3fed-3a24-442f-becc-97bac8b75e90'
    
    // Check all memories related to this user
    const result = await neo4jService.executeQuery(`
      MATCH (m:Memory)
      WHERE m.user_id = $userId 
         OR m.team_id = $userId
         OR m.workspace_id CONTAINS $userId
      RETURN 
        m.user_id as user_id,
        m.team_id as team_id,
        m.workspace_id as workspace_id,
        m.project_name as project_name
      LIMIT 20
    `, { userId })
    
    console.log('Sample memories for user:', userId)
    console.log('─'.repeat(80))
    
    result.records.forEach((record, i) => {
      console.log(`Memory ${i + 1}:`)
      console.log('  user_id:', record.user_id)
      console.log('  team_id:', record.team_id)
      console.log('  workspace_id:', record.workspace_id)
      console.log('  project:', record.project_name)
      console.log()
    })

    // Get statistics
    const statsResult = await neo4jService.executeQuery(`
      MATCH (m:Memory)
      WHERE m.user_id = $userId 
         OR m.team_id = $userId
         OR m.workspace_id CONTAINS $userId
      RETURN 
        COUNT(CASE WHEN m.user_id = $userId THEN 1 END) as whereUserIdMatches,
        COUNT(CASE WHEN m.team_id = $userId THEN 1 END) as whereTeamIdMatches,
        COUNT(CASE WHEN m.workspace_id CONTAINS $userId THEN 1 END) as whereWorkspaceContainsUserId,
        COUNT(CASE WHEN m.user_id IS NOT NULL THEN 1 END) as hasUserId,
        COUNT(CASE WHEN m.team_id IS NOT NULL THEN 1 END) as hasTeamId,
        COUNT(CASE WHEN m.workspace_id IS NOT NULL THEN 1 END) as hasWorkspaceId,
        COUNT(*) as total
    `, { userId })
    
    console.log('📊 Statistics:')
    console.log('─'.repeat(80))
    const stats = statsResult.records[0]
    console.log('Total memories found:', stats.total?.toNumber() || 0)
    console.log('\nMatching conditions:')
    console.log('  - Where user_id = userId:', stats.whereUserIdMatches?.toNumber() || 0)
    console.log('  - Where team_id = userId:', stats.whereTeamIdMatches?.toNumber() || 0, '⚠️  This is unusual!')
    console.log('  - Where workspace_id contains userId:', stats.whereWorkspaceContainsUserId?.toNumber() || 0)
    console.log('\nField presence:')
    console.log('  - Has user_id:', stats.hasUserId?.toNumber() || 0)
    console.log('  - Has team_id:', stats.hasTeamId?.toNumber() || 0)
    console.log('  - Has workspace_id:', stats.hasWorkspaceId?.toNumber() || 0)

    // Check distinct values
    const distinctResult = await neo4jService.executeQuery(`
      MATCH (m:Memory)
      WHERE m.user_id = $userId 
         OR m.team_id = $userId
         OR m.workspace_id CONTAINS $userId
      RETURN 
        COLLECT(DISTINCT m.user_id)[0..5] as userIds,
        COLLECT(DISTINCT m.team_id)[0..5] as teamIds,
        COLLECT(DISTINCT m.workspace_id)[0..5] as workspaceIds
    `, { userId })
    
    console.log('\n📋 Distinct values found:')
    console.log('─'.repeat(80))
    const distinct = distinctResult.records[0]
    console.log('Distinct user_ids:', distinct.userIds)
    console.log('Distinct team_ids:', distinct.teamIds)
    console.log('Distinct workspace_ids:', distinct.workspaceIds)

  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    console.log('\n🎯 Done!')
  }
}

analyzeMemoryOwnership()