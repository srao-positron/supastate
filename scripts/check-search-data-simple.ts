#!/usr/bin/env npx tsx

import neo4j from 'neo4j-driver'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') })

async function checkSearchData() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI || 'neo4j://localhost:7687',
    neo4j.auth.basic(
      process.env.NEO4J_USERNAME || 'neo4j',
      process.env.NEO4J_PASSWORD || ''
    )
  )
  
  const session = driver.session()
  
  try {
    console.log('Checking Neo4j data for search...\n')
    
    // Check EntitySummary nodes with embeddings (used for semantic search)
    const summaryResult = await session.run(`
      MATCH (s:EntitySummary)
      RETURN 
        count(s) as total,
        count(CASE WHEN s.embedding IS NOT NULL THEN 1 END) as withEmbeddings,
        collect(DISTINCT s.workspace_id)[0..5] as sampleWorkspaces
    `)
    
    const summaryRecord = summaryResult.records[0]
    console.log(`EntitySummary nodes: ${summaryRecord.get('total')} (${summaryRecord.get('withEmbeddings')} with embeddings)`)
    console.log(`Sample workspaces:`, summaryRecord.get('sampleWorkspaces'))
    
    // Check Memory nodes
    const memoryResult = await session.run(`
      MATCH (m:Memory)
      RETURN 
        count(m) as total,
        count(CASE WHEN m.content IS NOT NULL THEN 1 END) as withContent,
        collect(DISTINCT m.workspace_id)[0..5] as sampleWorkspaces
    `)
    
    const memoryRecord = memoryResult.records[0]
    console.log(`\nMemory nodes: ${memoryRecord.get('total')} (${memoryRecord.get('withContent')} with content)`)
    console.log(`Sample workspaces:`, memoryRecord.get('sampleWorkspaces'))
    
    // Check CodeEntity nodes
    const codeResult = await session.run(`
      MATCH (c:CodeEntity)
      RETURN 
        count(c) as total,
        count(CASE WHEN c.content IS NOT NULL THEN 1 END) as withContent,
        collect(DISTINCT c.workspace_id)[0..5] as sampleWorkspaces
    `)
    
    const codeRecord = codeResult.records[0]
    console.log(`\nCodeEntity nodes: ${codeRecord.get('total')} (${codeRecord.get('withContent')} with content)`)
    console.log(`Sample workspaces:`, codeRecord.get('sampleWorkspaces'))
    
    // Check workspace distribution
    const workspaceResult = await session.run(`
      MATCH (n)
      WHERE n.workspace_id IS NOT NULL
      WITH n.workspace_id as workspace, count(n) as count
      RETURN workspace, count
      ORDER BY count DESC
      LIMIT 10
    `)
    
    console.log('\nTop workspaces by node count:')
    workspaceResult.records.forEach(record => {
      console.log(`  ${record.get('workspace')}: ${record.get('count')} nodes`)
    })
    
    // Test search with a sample workspace
    console.log('\n--- TESTING SEARCH ---\n')
    
    // Get a user workspace
    const userWorkspaceResult = await session.run(`
      MATCH (n)
      WHERE n.workspace_id =~ 'user:.*'
      RETURN DISTINCT n.workspace_id as workspace
      LIMIT 1
    `)
    
    if (userWorkspaceResult.records.length > 0) {
      const testWorkspace = userWorkspaceResult.records[0].get('workspace')
      console.log(`Testing with workspace: ${testWorkspace}`)
      
      // Test keyword search
      const keywordResult = await session.run(`
        CALL {
          // Search memories
          MATCH (m:Memory)
          WHERE m.content =~ '(?i).*debug.*'
            AND m.workspace_id = $workspace
          RETURN m as entity, 'memory' as type, 0.7 as score
          LIMIT 5
          
          UNION
          
          // Search code
          MATCH (c:CodeEntity)
          WHERE (c.content =~ '(?i).*debug.*' OR c.path =~ '(?i).*debug.*')
            AND c.workspace_id = $workspace
          RETURN c as entity, 'code' as type, 0.7 as score
          LIMIT 5
        }
        
        WITH entity, type, score
        RETURN type, count(entity) as count
      `, { workspace: testWorkspace })
      
      console.log('\nKeyword search results for "debug":')
      keywordResult.records.forEach(record => {
        console.log(`  ${record.get('type')}: ${record.get('count')} results`)
      })
      
      // Test EntitySummary search
      const summarySearchResult = await session.run(`
        MATCH (s:EntitySummary)
        WHERE s.embedding IS NOT NULL
          AND s.workspace_id = $workspace
        RETURN count(s) as count
      `, { workspace: testWorkspace })
      
      console.log(`\nEntitySummary nodes for semantic search: ${summarySearchResult.records[0].get('count')}`)
    }
    
    // Check relationships
    const relResult = await session.run(`
      MATCH ()-[r:REFERENCES_CODE|DISCUSSED_IN]-()
      RETURN type(r) as type, count(r) as count
    `)
    
    console.log('\nRelationships:')
    relResult.records.forEach(record => {
      console.log(`  ${record.get('type')}: ${record.get('count')}`)
    })
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await session.close()
    await driver.close()
  }
}

checkSearchData().catch(console.error)