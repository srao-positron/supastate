#!/usr/bin/env tsx

import { neo4jService } from '../src/lib/neo4j/service'
import dotenv from 'dotenv'
import { resolve } from 'path'

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env.local') })

async function findUsersWithData() {
  console.log('🔍 Finding users with data in Neo4j')
  console.log('=' .repeat(80))
  
  try {
    // Find unique workspace IDs with EntitySummary data
    const workspaceResult = await neo4jService.executeQuery(`
      MATCH (s:EntitySummary)
      WHERE s.workspace_id IS NOT NULL
      RETURN DISTINCT s.workspace_id as workspace_id, count(s) as summaryCount
      ORDER BY summaryCount DESC
      LIMIT 10
    `, {})
    
    console.log('\n📊 Workspaces with EntitySummary data:')
    workspaceResult.records.forEach(record => {
      console.log(`  - ${record.workspace_id}: ${record.summaryCount} summaries`)
    })
    
    // Find unique user IDs with data
    const userResult = await neo4jService.executeQuery(`
      MATCH (n)
      WHERE (n:EntitySummary OR n:Memory OR n:CodeEntity)
        AND n.user_id IS NOT NULL
      RETURN DISTINCT n.user_id as user_id, labels(n)[0] as type, count(n) as count
      ORDER BY count DESC
      LIMIT 20
    `, {})
    
    console.log('\n👤 Users with data:')
    userResult.records.forEach(record => {
      console.log(`  - ${record.user_id} (${record.type}): ${record.count} nodes`)
    })
    
    // Check team IDs
    const teamResult = await neo4jService.executeQuery(`
      MATCH (n)
      WHERE (n:EntitySummary OR n:Memory OR n:CodeEntity)
        AND n.team_id IS NOT NULL
      RETURN DISTINCT n.team_id as team_id, labels(n)[0] as type, count(n) as count
      ORDER BY count DESC
      LIMIT 10
    `, {})
    
    console.log('\n👥 Teams with data:')
    teamResult.records.forEach(record => {
      console.log(`  - ${record.team_id} (${record.type}): ${record.count} nodes`)
    })
    
    // Get a sample user with lots of data
    const sampleResult = await neo4jService.executeQuery(`
      MATCH (s:EntitySummary)
      WHERE s.workspace_id IS NOT NULL
        AND s.embedding IS NOT NULL
      WITH s.workspace_id as workspace_id, s.user_id as user_id, s.team_id as team_id
      RETURN workspace_id, user_id, team_id, count(*) as count
      ORDER BY count DESC
      LIMIT 1
    `, {})
    
    if (sampleResult.records.length > 0) {
      const sample = sampleResult.records[0]
      console.log('\n✅ Best test user:')
      console.log(`  - Workspace ID: ${sample.workspace_id}`)
      console.log(`  - User ID: ${sample.user_id}`)
      console.log(`  - Team ID: ${sample.team_id}`)
      console.log(`  - Entity summaries with embeddings: ${sample.count}`)
      
      // Extract user ID from workspace ID if it's a user workspace
      if (sample.workspace_id?.startsWith('user:')) {
        const extractedUserId = sample.workspace_id.substring(5)
        console.log(`  - Extracted User ID: ${extractedUserId}`)
      }
    }
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    console.log('\n✅ Script completed')
  }
}

// Run the script
findUsersWithData().catch(console.error)