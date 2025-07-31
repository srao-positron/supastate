#!/usr/bin/env npx tsx

import neo4j from 'neo4j-driver'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') })

async function debugSearchIssue() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI || 'neo4j://localhost:7687',
    neo4j.auth.basic(
      process.env.NEO4J_USERNAME || 'neo4j',
      process.env.NEO4J_PASSWORD || ''
    )
  )
  
  const session = driver.session()
  
  try {
    console.log('Debugging search issue...\n')
    
    const userId = 'a02c3fed-3a24-442f-becc-97bac8b75e90'
    const personalWorkspaceId = `user:${userId}`
    
    // 1. Check what data exists for this user
    console.log('1. Checking data for user:', userId)
    
    const memoryCountResult = await session.run(`
      MATCH (m:Memory)
      WHERE m.workspace_id = $personalWorkspaceId OR 
            (m.user_id = $userId AND m.workspace_id IS NULL)
      RETURN count(m) as count
    `, { userId, personalWorkspaceId })
    
    console.log(`   Memories: ${memoryCountResult.records[0].get('count')}`)
    
    const codeCountResult = await session.run(`
      MATCH (c:CodeEntity)
      WHERE c.workspace_id = $personalWorkspaceId OR 
            (c.user_id = $userId AND c.workspace_id IS NULL)
      RETURN count(c) as count
    `, { userId, personalWorkspaceId })
    
    console.log(`   Code entities: ${codeCountResult.records[0].get('count')}`)
    
    // 2. Check EntitySummary nodes (used by semantic search)
    const summaryCountResult = await session.run(`
      MATCH (s:EntitySummary)
      WHERE s.workspace_id = $personalWorkspaceId OR 
            (s.user_id = $userId AND s.workspace_id IS NULL)
      RETURN count(s) as total,
             count(CASE WHEN s.embedding IS NOT NULL THEN 1 END) as withEmbeddings
    `, { userId, personalWorkspaceId })
    
    const summaryRecord = summaryCountResult.records[0]
    console.log(`   Entity summaries: ${summaryRecord.get('total')} (${summaryRecord.get('withEmbeddings')} with embeddings)`)
    
    // 3. Test keyword search directly
    console.log('\n2. Testing keyword search for "debug"')
    
    const keywordResult = await session.run(`
      CALL {
        MATCH (m:Memory)
        WHERE m.content =~ '(?i).*debug.*'
          AND (m.workspace_id = $personalWorkspaceId OR (m.user_id = $userId AND m.workspace_id IS NULL))
        RETURN m as entity, 'memory' as type, 0.7 as score
        LIMIT 5
        
        UNION
        
        MATCH (c:CodeEntity)
        WHERE (c.content =~ '(?i).*debug.*' OR c.path =~ '(?i).*debug.*')
          AND (c.workspace_id = $personalWorkspaceId OR (c.user_id = $userId AND c.workspace_id IS NULL))
        RETURN c as entity, 'code' as type, 0.7 as score
        LIMIT 5
      }
      
      WITH entity, type, score
      RETURN type, count(entity) as count
    `, { userId, personalWorkspaceId })
    
    console.log('   Results:')
    keywordResult.records.forEach(record => {
      console.log(`     ${record.get('type')}: ${record.get('count')}`)
    })
    
    // 4. Sample some actual content
    console.log('\n3. Sample memory content:')
    
    const sampleResult = await session.run(`
      MATCH (m:Memory)
      WHERE (m.workspace_id = $personalWorkspaceId OR (m.user_id = $userId AND m.workspace_id IS NULL))
        AND m.content IS NOT NULL
      RETURN m.content as content, m.workspace_id as workspace, m.user_id as user
      LIMIT 3
    `, { userId, personalWorkspaceId })
    
    sampleResult.records.forEach((record, i) => {
      const content = record.get('content')
      const workspace = record.get('workspace')
      const user = record.get('user')
      console.log(`\n   ${i + 1}. Workspace: ${workspace}, User: ${user}`)
      console.log(`      Content: ${content.substring(0, 100)}...`)
    })
    
    // 5. Check if integer conversion is the issue
    console.log('\n4. Testing LIMIT with different values:')
    
    const testLimits = [5, 10, 50, parseInt('10', 10)]
    for (const limit of testLimits) {
      try {
        const result = await session.run(`
          MATCH (m:Memory)
          WHERE m.workspace_id = $personalWorkspaceId
          RETURN count(m) as count
          LIMIT $limit
        `, { personalWorkspaceId, limit })
        console.log(`   LIMIT ${limit} (type: ${typeof limit}): Success`)
      } catch (error: any) {
        console.log(`   LIMIT ${limit} (type: ${typeof limit}): Error - ${error.message}`)
      }
    }
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await session.close()
    await driver.close()
  }
}

debugSearchIssue().catch(console.error)