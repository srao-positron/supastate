#!/usr/bin/env tsx
import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { neo4jService } from '../src/lib/neo4j/service'
import { getOwnershipFilter } from '../src/lib/neo4j/query-patterns'

async function testDashboardFix() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )

  console.log('🔍 Testing Dashboard Fix...\n')

  try {
    await neo4jService.initialize()

    // Use a known user ID (you'll need to provide this)
    const userId = process.env.TEST_USER_ID || 'cbf3ad14-c2f2-4bb1-ac14-0c5e88e8de77' // Replace with actual user ID
    
    console.log('👤 Testing with user ID:', userId)

    // First check if this user has a team
    const { data: profile } = await supabase
      .from('profiles')
      .select('team_id')
      .eq('id', userId)
      .single()

    const workspaceId = profile?.team_id ? `team:${profile.team_id}` : undefined
    
    console.log('Team ID:', profile?.team_id)
    console.log('Workspace ID:', workspaceId)

    // Test the ownership filter
    const ownershipFilter = getOwnershipFilter({ userId, workspaceId, nodeAlias: 'm' })
    console.log('\n🔍 Ownership filter:', ownershipFilter)

    // Test 1: Memory Count with proper filter
    console.log('\n📊 Test 1: Memory Count (Fixed)')
    const memoryCountResult = await neo4jService.executeQuery(`
      MATCH (m:Memory)
      WHERE ${ownershipFilter}
      RETURN count(m) as total
    `, {
      userId,
      workspaceId
    })
    const totalMemories = memoryCountResult.records[0]?.total?.toNumber() || 0
    console.log('Total memories:', totalMemories)

    // Test 2: Session Count
    console.log('\n📊 Test 2: Session Count')
    const sessionCountResult = await neo4jService.executeQuery(`
      MATCH (m:Memory)
      WHERE ${ownershipFilter}
        AND m.chunk_id IS NOT NULL
      RETURN count(DISTINCT m.chunk_id) as uniqueSessions
    `, {
      userId,
      workspaceId
    })
    const uniqueSessions = sessionCountResult.records[0]?.uniqueSessions?.toNumber() || 0
    console.log('Unique sessions:', uniqueSessions)
    
    console.log('\n✅ Summary:')
    console.log(`- Total Memories: ${totalMemories}`)
    console.log(`- Unique Sessions: ${uniqueSessions}`)
    console.log(`- Issue: Dashboard was showing ${uniqueSessions} memories instead of ${totalMemories}`)

    // Test 3: Code Stats
    console.log('\n📊 Test 3: Code Entity Stats (Fixed)')
    const codeOwnershipFilter = getOwnershipFilter({ userId, workspaceId, nodeAlias: 'e' })
    const codeStatsResult = await neo4jService.executeQuery(`
      MATCH (e:CodeEntity)
      WHERE ${codeOwnershipFilter}
      RETURN 
        COUNT(DISTINCT e) as totalEntities,
        COUNT(DISTINCT e.path) as totalFiles,
        COUNT(DISTINCT e.project_name) as totalProjects
    `, {
      userId,
      workspaceId
    })
    
    if (codeStatsResult.records.length > 0) {
      const record = codeStatsResult.records[0]
      const totalEntities = record.totalEntities?.toNumber() || 0
      const totalFiles = record.totalFiles?.toNumber() || 0
      const totalProjects = record.totalProjects?.toNumber() || 0
      
      console.log('Total entities:', totalEntities)
      console.log('Total files:', totalFiles)
      console.log('Total projects:', totalProjects)
      
      console.log('\n✅ Code Stats Summary:')
      console.log(`- Total Code Entities: ${totalEntities}`)
      console.log(`- Total Files: ${totalFiles}`)
      console.log(`- Dashboard should show: "${totalEntities.toLocaleString()} across ${totalFiles} files"`)
    }

    // Test 4: Check relationships
    console.log('\n📊 Test 4: Code-Memory Relationships')
    const relationshipResult = await neo4jService.executeQuery(`
      MATCH (m:Memory)-[r:REFERENCES_CODE|DISCUSSES]->(e:CodeEntity)
      WHERE ${ownershipFilter}
      RETURN COUNT(r) as totalRelationships
    `, {
      userId,
      workspaceId
    })
    console.log('Total code-memory relationships:', relationshipResult.records[0]?.totalRelationships?.toNumber() || 0)

  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    console.log('\n🎯 Done!')
  }
}

testDashboardFix()