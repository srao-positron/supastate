#!/usr/bin/env tsx
import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { neo4jService } from '../src/lib/neo4j/service'
import { getOwnershipFilter } from '../src/lib/neo4j/query-patterns'

async function debugOwnershipFilter() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )

  console.log('🔍 Debugging Ownership Filter Issue...\n')

  try {
    await neo4jService.initialize()

    // The user from the logs
    const userId = 'a02c3fed-3a24-442f-becc-97bac8b75e90'
    
    console.log('👤 Testing with user ID:', userId)

    // Get user's profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('team_id')
      .eq('id', userId)
      .single()

    console.log('Profile:', profile)
    const workspaceId = profile?.team_id ? `team:${profile.team_id}` : undefined
    
    console.log('Team ID:', profile?.team_id)
    console.log('Workspace ID:', workspaceId)

    // Test 1: Check what data exists for this user
    console.log('\n📊 Test 1: What Memory data exists?')
    const checkDataResult = await neo4jService.executeQuery(`
      MATCH (m:Memory)
      WHERE m.user_id = $userId OR m.workspace_id = $workspaceId
      RETURN 
        COUNT(CASE WHEN m.user_id = $userId THEN 1 END) as withUserId,
        COUNT(CASE WHEN m.workspace_id = $workspaceId THEN 1 END) as withWorkspaceId,
        COUNT(CASE WHEN m.workspace_id IS NULL THEN 1 END) as withNullWorkspace,
        COUNT(CASE WHEN m.workspace_id IS NOT NULL THEN 1 END) as withNonNullWorkspace,
        COUNT(m) as total,
        COLLECT(DISTINCT m.workspace_id)[0..5] as sampleWorkspaceIds
    `, {
      userId,
      workspaceId
    })
    
    const data = checkDataResult.records[0]
    console.log('Memories with user_id =', userId, ':', data.withUserId?.toNumber() || 0)
    console.log('Memories with workspace_id =', workspaceId, ':', data.withWorkspaceId?.toNumber() || 0)
    console.log('Memories with NULL workspace_id:', data.withNullWorkspace?.toNumber() || 0)
    console.log('Memories with non-NULL workspace_id:', data.withNonNullWorkspace?.toNumber() || 0)
    console.log('Total memories:', data.total?.toNumber() || 0)
    console.log('Sample workspace IDs:', data.sampleWorkspaceIds)

    // Test 2: What does the ownership filter produce?
    console.log('\n📊 Test 2: Ownership Filter Analysis')
    const filter = getOwnershipFilter({ userId, workspaceId, nodeAlias: 'm' })
    console.log('Generated filter:', filter)
    console.log('Expected to match:')
    if (workspaceId) {
      console.log('  - Records where workspace_id =', workspaceId)
      console.log('  - Records where user_id =', userId, 'AND workspace_id IS NULL')
    } else {
      console.log('  - Records where user_id =', userId, 'AND workspace_id IS NULL')
    }

    // Test 3: Run the actual query with the filter
    console.log('\n📊 Test 3: Query with Ownership Filter')
    const filterResult = await neo4jService.executeQuery(`
      MATCH (m:Memory)
      WHERE ${filter}
      RETURN COUNT(m) as count
    `, {
      userId,
      workspaceId
    })
    console.log('Count with ownership filter:', filterResult.records[0]?.count?.toNumber() || 0)

    // Test 4: Check the old query that returns 12031
    console.log('\n📊 Test 4: Old Query (returns 12031)')
    const oldQueryResult = await neo4jService.executeQuery(`
      MATCH (m:Memory)
      WHERE m.user_id = $userId OR m.team_id = $userId
      RETURN COUNT(m) as count
    `, {
      userId
    })
    console.log('Count with old query:', oldQueryResult.records[0]?.count?.toNumber() || 0)

    // Test 5: Sample some actual memory records
    console.log('\n📊 Test 5: Sample Memory Records')
    const sampleResult = await neo4jService.executeQuery(`
      MATCH (m:Memory)
      WHERE m.user_id = $userId OR m.team_id = $userId
      RETURN m.id, m.user_id, m.team_id, m.workspace_id
      LIMIT 5
    `, {
      userId
    })
    
    console.log('Sample memories:')
    sampleResult.records.forEach(record => {
      console.log({
        id: record.get('m.id'),
        user_id: record.get('m.user_id'),
        team_id: record.get('m.team_id'),
        workspace_id: record.get('m.workspace_id')
      })
    })

  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    console.log('\n🎯 Done!')
  }
}

debugOwnershipFilter()