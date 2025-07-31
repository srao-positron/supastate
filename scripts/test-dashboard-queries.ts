#!/usr/bin/env tsx
import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { neo4jService } from '../src/lib/neo4j/service'
import { getOwnershipFilter } from '../src/lib/neo4j/query-patterns'

async function testDashboardQueries() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  console.log('🔍 Testing Dashboard Queries...\n')

  try {
    await neo4jService.initialize()

    // Get a test user 
    const { data: users } = await supabase
      .from('profiles')
      .select('id, email, team_id')
      .limit(1)
    
    if (!users || users.length === 0) {
      console.log('No users found')
      return
    }

    const user = users[0]
    const workspaceId = user.team_id ? `team:${user.team_id}` : undefined
    
    console.log('👤 Testing with user:', {
      userId: user.id,
      email: user.email,
      teamId: user.team_id,
      workspaceId
    })

    // Test 1: Memory Count
    console.log('\n📊 Test 1: Memory Count')
    const memoryCountResult = await neo4jService.executeQuery(`
      MATCH (m:Memory)
      WHERE ${getOwnershipFilter({ userId: user.id, workspaceId, nodeAlias: 'm' })}
      RETURN count(m) as total
    `, {
      userId: user.id,
      workspaceId
    })
    console.log('Total memories:', memoryCountResult.records[0]?.total?.toNumber() || 0)

    // Test 2: Session Count
    console.log('\n📊 Test 2: Session Count')
    const sessionCountResult = await neo4jService.executeQuery(`
      MATCH (m:Memory)
      WHERE ${getOwnershipFilter({ userId: user.id, workspaceId, nodeAlias: 'm' })}
        AND m.chunk_id IS NOT NULL
      RETURN count(DISTINCT m.chunk_id) as uniqueSessions
    `, {
      userId: user.id,
      workspaceId
    })
    console.log('Unique sessions:', sessionCountResult.records[0]?.uniqueSessions?.toNumber() || 0)

    // Test 3: Code Entity Count
    console.log('\n📊 Test 3: Code Entity Stats')
    const codeStatsResult = await neo4jService.executeQuery(`
      MATCH (e:CodeEntity)
      WHERE ${getOwnershipFilter({ userId: user.id, workspaceId, nodeAlias: 'e' })}
      RETURN 
        COUNT(DISTINCT e) as totalEntities,
        COUNT(DISTINCT e.path) as totalFiles,
        COUNT(DISTINCT e.project_name) as totalProjects
    `, {
      userId: user.id,
      workspaceId
    })
    
    if (codeStatsResult.records.length > 0) {
      const record = codeStatsResult.records[0]
      console.log('Total entities:', record.totalEntities?.toNumber() || 0)
      console.log('Total files:', record.totalFiles?.toNumber() || 0)
      console.log('Total projects:', record.totalProjects?.toNumber() || 0)
    }

    // Test 4: Linked Entities
    console.log('\n📊 Test 4: Linked Code-Memory Entities')
    const linkedResult = await neo4jService.executeQuery(`
      MATCH (e:CodeEntity)
      WHERE ${getOwnershipFilter({ userId: user.id, workspaceId, nodeAlias: 'e' })}
        AND EXISTS((e)<-[:REFERENCES_CODE|DISCUSSES]-(:Memory))
      RETURN COUNT(DISTINCT e) as linkedEntities
    `, {
      userId: user.id,
      workspaceId
    })
    console.log('Linked entities:', linkedResult.records[0]?.linkedEntities?.toNumber() || 0)

    // Test 5: Check actual relationships
    console.log('\n📊 Test 5: Code-Memory Relationships')
    const relationshipResult = await neo4jService.executeQuery(`
      MATCH (m:Memory)-[r:REFERENCES_CODE|DISCUSSES]->(e:CodeEntity)
      WHERE ${getOwnershipFilter({ userId: user.id, workspaceId, nodeAlias: 'm' })}
      RETURN COUNT(r) as totalRelationships, 
             COUNT(DISTINCT m) as memoriesWithCode,
             COUNT(DISTINCT e) as codeEntitiesReferenced
    `, {
      userId: user.id,
      workspaceId
    })
    
    if (relationshipResult.records.length > 0) {
      const record = relationshipResult.records[0]
      console.log('Total relationships:', record.totalRelationships?.toNumber() || 0)
      console.log('Memories with code:', record.memoriesWithCode?.toNumber() || 0)
      console.log('Code entities referenced:', record.codeEntitiesReferenced?.toNumber() || 0)
    }

    // Test 6: Sample data
    console.log('\n📊 Test 6: Sample Data')
    
    // Sample memories
    const sampleMemoriesResult = await neo4jService.executeQuery(`
      MATCH (m:Memory)
      WHERE ${getOwnershipFilter({ userId: user.id, workspaceId, nodeAlias: 'm' })}
      RETURN m.id, m.project_name, m.chunk_id, m.user_id, m.workspace_id
      LIMIT 3
    `, {
      userId: user.id,
      workspaceId
    })
    
    console.log('\nSample memories:')
    sampleMemoriesResult.records.forEach(record => {
      console.log({
        id: record.get('m.id'),
        project: record.get('m.project_name'),
        chunk_id: record.get('m.chunk_id'),
        user_id: record.get('m.user_id'),
        workspace_id: record.get('m.workspace_id')
      })
    })

    // Sample code entities
    const sampleCodeResult = await neo4jService.executeQuery(`
      MATCH (e:CodeEntity)
      WHERE ${getOwnershipFilter({ userId: user.id, workspaceId, nodeAlias: 'e' })}
      RETURN e.id, e.path, e.project_name, e.user_id, e.workspace_id
      LIMIT 3
    `, {
      userId: user.id,
      workspaceId
    })
    
    console.log('\nSample code entities:')
    sampleCodeResult.records.forEach(record => {
      console.log({
        id: record.get('e.id'),
        path: record.get('e.path'),
        project: record.get('e.project_name'),
        user_id: record.get('e.user_id'),
        workspace_id: record.get('e.workspace_id')
      })
    })

  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await neo4jService.close()
  }
}

testDashboardQueries()