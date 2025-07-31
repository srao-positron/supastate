/**
 * Test script for summary creation
 */

import * as dotenv from 'dotenv'
import { neo4jService } from '../src/lib/neo4j/service'

// Load environment variables
dotenv.config({ path: '.env.local' })

async function testSummaryCreation() {
  console.log('\n=== Testing Summary Creation ===')
  
  try {
    await neo4jService.initialize()
    
    // First, check if we have any memories to test with
    const memoryCheck = await neo4jService.executeQuery(`
      MATCH (m:Memory)
      WHERE m.content IS NOT NULL
        AND m.embedding IS NOT NULL
      RETURN m
      LIMIT 5
    `, {})
    
    console.log(`\nFound ${memoryCheck.records.length} memories to test with`)
    
    if (memoryCheck.records.length === 0) {
      console.log('No memories found. Please ingest some memories first.')
      return
    }
    
    // Create summaries for test memories
    for (const record of memoryCheck.records) {
      const memory = record.m
      console.log(`\nCreating summary for memory: ${memory.id}`)
      console.log(`Content preview: ${memory.content ? memory.content.substring(0, 100) + '...' : 'No content'}`)
      
      // Extract simple keywords
      const keywords = extractKeywords(memory.content)
      console.log('Keywords:', keywords)
      
      // Determine pattern signals
      const patternSignals = {
        is_debugging: keywords.error > 0 || keywords.bug > 0 || keywords.fix > 0,
        is_learning: keywords.learn > 0 || keywords.understand > 0,
        is_refactoring: keywords.refactor > 0 || keywords.improve > 0,
        complexity_score: 0.5,
        urgency_score: keywords.error > 2 ? 0.8 : 0.5
      }
      console.log('Pattern signals:', patternSignals)
      
      // Create entity summary
      const summaryId = crypto.randomUUID()
      const summaryResult = await neo4jService.executeQuery(`
        CREATE (s:EntitySummary {
          id: $summaryId,
          entity_id: $entityId,
          entity_type: 'memory',
          user_id: $userId,
          workspace_id: $workspaceId,
          project_name: $projectName,
          created_at: datetime(),
          updated_at: datetime(),
          embedding: $embedding,
          keyword_frequencies: $keywords,
          pattern_signals: $patternSignals
        })
        WITH s
        MATCH (m:Memory {id: $entityId})
        CREATE (s)-[:SUMMARIZES]->(m)
        RETURN s
      `, {
        summaryId,
        entityId: memory.id,
        userId: memory.user_id,
        workspaceId: memory.workspace_id,
        projectName: memory.project_name || 'default',
        embedding: memory.embedding,
        keywords: JSON.stringify(keywords),
        patternSignals: JSON.stringify(patternSignals)
      })
      
      if (summaryResult.records.length > 0) {
        console.log(`✓ Created summary: ${summaryId}`)
      }
    }
    
    // Test session creation
    console.log('\n=== Testing Session Creation ===')
    
    const sessionId = crypto.randomUUID()
    const sessionResult = await neo4jService.executeQuery(`
      CREATE (s:SessionSummary {
        id: $sessionId,
        user_id: $userId,
        project_name: 'test-project',
        start_time: datetime() - duration({minutes: 30}),
        end_time: datetime(),
        entity_count: 5,
        dominant_patterns: ['debugging', 'learning'],
        keywords: $keywords
      })
      RETURN s
    `, {
      sessionId,
      userId: memoryCheck.records[0].m.user_id || 'test-user',
      keywords: JSON.stringify({ error: 3, fix: 2, learn: 1 })
    })
    
    if (sessionResult.records.length > 0) {
      console.log(`✓ Created session: ${sessionId}`)
    }
    
    // Link summaries to session
    console.log('\nLinking summaries to session...')
    const linkResult = await neo4jService.executeQuery(`
      MATCH (s:SessionSummary {id: $sessionId})
      MATCH (e:EntitySummary)
      WHERE e.created_at > datetime() - duration({minutes: 5})
      WITH s, e LIMIT 3
      CREATE (s)-[:CONTAINS_ENTITY]->(e)
      RETURN count(*) as linked
    `, { sessionId })
    
    if (linkResult.records.length > 0) {
      const linked = linkResult.records[0].linked
      console.log(`✓ Linked ${linked} summaries to session`)
    }
    
    // Verify relationships
    console.log('\n=== Verifying Relationships ===')
    
    const verifyResult = await neo4jService.executeQuery(`
      MATCH (s:EntitySummary)-[:SUMMARIZES]->(m:Memory)
      RETURN count(*) as summaryCount
    `, {})
    
    console.log(`Total summaries created: ${verifyResult.records[0].summaryCount}`)
    
    const sessionVerify = await neo4jService.executeQuery(`
      MATCH (s:SessionSummary)-[:CONTAINS_ENTITY]->(e:EntitySummary)
      RETURN s.id as sessionId, count(e) as entityCount
    `, {})
    
    console.log('\nSessions with entities:')
    sessionVerify.records.forEach(record => {
      console.log(`  Session ${record.sessionId}: ${record.entityCount} entities`)
    })
    
    console.log('\n=== Summary Creation Test Complete ===')
    
  } catch (error) {
    console.error('Test failed:', error)
  } finally {
    if (typeof neo4jService.close === 'function') {
      await neo4jService.close()
    }
  }
}

function extractKeywords(content: string): Record<string, number> {
  const keywords: Record<string, number> = {}
  const importantWords = [
    'error', 'bug', 'fix', 'debug', 'issue', 'problem',
    'learn', 'understand', 'study', 'research', 'explore',
    'refactor', 'improve', 'optimize', 'clean', 'restructure',
    'build', 'create', 'implement', 'develop', 'feature'
  ]
  
  const lowerContent = content.toLowerCase()
  for (const word of importantWords) {
    const regex = new RegExp(`\\b${word}\\w*\\b`, 'gi')
    const matches = lowerContent.match(regex)
    if (matches) {
      keywords[word] = matches.length
    }
  }
  
  return keywords
}

testSummaryCreation().catch(console.error)