/**
 * Test script to explore Neo4j data and test pattern discovery queries
 */

import { neo4jService } from '../src/lib/neo4j/service'
import { log } from '../src/lib/logger'

async function testMemoryStats() {
  console.log('\n=== Testing Memory Statistics ===')
  
  const query = `
    MATCH (m:Memory)
    RETURN 
      COUNT(m) as totalMemories,
      COUNT(DISTINCT m.project_name) as totalProjects,
      COUNT(DISTINCT m.user_id) as totalUsers,
      COUNT(DISTINCT m.workspace_id) as totalWorkspaces
  `
  
  const result = await neo4jService.executeQuery(query, {})
  const stats = result.records[0]
  
  console.log('Memory Stats:', {
    totalMemories: stats.totalMemories?.toNumber() || 0,
    totalProjects: stats.totalProjects?.toNumber() || 0,
    totalUsers: stats.totalUsers?.toNumber() || 0,
    totalWorkspaces: stats.totalWorkspaces?.toNumber() || 0
  })
}

async function testTemporalPatterns() {
  console.log('\n=== Testing Temporal Patterns ===')
  
  // Find memories that are close in time
  const query = `
    MATCH (m1:Memory)
    MATCH (m2:Memory)
    WHERE m1.id <> m2.id
      AND m1.project_name = m2.project_name
      AND m1.occurred_at IS NOT NULL
      AND m2.occurred_at IS NOT NULL
      AND datetime(m1.occurred_at) < datetime(m2.occurred_at)
      AND duration.between(datetime(m1.occurred_at), datetime(m2.occurred_at)).minutes < 30
    RETURN m1.id as memory1, 
           m2.id as memory2,
           m1.project_name as project,
           duration.between(datetime(m1.occurred_at), datetime(m2.occurred_at)).minutes as timeGapMinutes
    ORDER BY timeGapMinutes
    LIMIT 10
  `
  
  const result = await neo4jService.executeQuery(query, {})
  console.log(`Found ${result.records.length} temporal patterns`)
  
  result.records.slice(0, 3).forEach(record => {
    console.log({
      memory1: record.memory1,
      memory2: record.memory2,
      project: record.project,
      timeGap: record.timeGapMinutes?.toNumber() || 0
    })
  })
}

async function testDebuggingPatterns() {
  console.log('\n=== Testing Debugging Patterns ===')
  
  // Find memories that mention debugging keywords
  const query = `
    MATCH (m:Memory)
    WHERE toLower(m.content) CONTAINS 'error' 
       OR toLower(m.content) CONTAINS 'bug'
       OR toLower(m.content) CONTAINS 'fix'
       OR toLower(m.content) CONTAINS 'debug'
    RETURN m.id, 
           m.project_name,
           SUBSTRING(m.content, 0, 100) as contentPreview,
           m.occurred_at
    ORDER BY m.occurred_at DESC
    LIMIT 10
  `
  
  const result = await neo4jService.executeQuery(query, {})
  console.log(`Found ${result.records.length} debugging-related memories`)
  
  result.records.slice(0, 3).forEach(record => {
    console.log({
      id: record.id,
      project: record.project_name,
      preview: record.contentPreview
    })
  })
}

async function testCodeMemoryRelationships() {
  console.log('\n=== Testing Code-Memory Relationships ===')
  
  // Check if any DISCUSSES relationships exist
  const query = `
    MATCH (m:Memory)-[r:DISCUSSES]->(c:CodeEntity)
    RETURN COUNT(r) as relationshipCount
  `
  
  const result = await neo4jService.executeQuery(query, {})
  const count = result.records[0]?.relationshipCount?.toNumber() || 0
  console.log(`Found ${count} DISCUSSES relationships`)
  
  // If no relationships, let's see what we can infer
  if (count === 0) {
    console.log('\nNo existing relationships. Checking for potential connections...')
    
    const potentialQuery = `
      MATCH (m:Memory)
      MATCH (c:CodeEntity)
      WHERE m.project_name IS NOT NULL 
        AND c.project_name IS NOT NULL
        AND m.project_name = c.project_name
      RETURN m.project_name as project, 
             COUNT(DISTINCT m) as memoryCount,
             COUNT(DISTINCT c) as codeCount
      ORDER BY memoryCount DESC
      LIMIT 5
    `
    
    const potentialResult = await neo4jService.executeQuery(potentialQuery, {})
    console.log('\nPotential connections by project:')
    potentialResult.records.forEach(record => {
      console.log({
        project: record.project,
        memories: record.memoryCount?.toNumber() || 0,
        codeEntities: record.codeCount?.toNumber() || 0
      })
    })
  }
}

async function testProjectDistribution() {
  console.log('\n=== Testing Project Distribution ===')
  
  const query = `
    MATCH (m:Memory)
    RETURN m.project_name as project, 
           COUNT(m) as memoryCount
    ORDER BY memoryCount DESC
    LIMIT 10
  `
  
  const result = await neo4jService.executeQuery(query, {})
  console.log('\nTop projects by memory count:')
  result.records.forEach(record => {
    console.log({
      project: record.project || 'null',
      count: record.memoryCount?.toNumber() || 0
    })
  })
}

async function main() {
  try {
    await neo4jService.initialize()
    
    await testMemoryStats()
    await testProjectDistribution()
    await testTemporalPatterns()
    await testDebuggingPatterns()
    await testCodeMemoryRelationships()
    
    console.log('\n=== Tests Complete ===')
  } catch (error) {
    console.error('Test failed:', error)
  } finally {
    // Neo4j driver will be closed by the service
  }
}

// Run the tests
main().catch(console.error)