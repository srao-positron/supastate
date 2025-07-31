#!/usr/bin/env tsx
import { config } from 'dotenv'
config({ path: '.env.local' })

import { neo4jService } from '../src/lib/neo4j/service'

async function fixPatternRelationships() {
  console.log('🔧 Fixing Pattern-Entity Relationships...\n')

  try {
    await neo4jService.initialize()
    
    // First, let's see what patterns we have
    const patternResult = await neo4jService.executeQuery(`
      MATCH (p:Pattern)
      RETURN p.pattern_type as type, p.pattern_name as name, p.metadata as metadata, COUNT(p) as count
      ORDER BY count DESC
    `, {})
    
    console.log('📊 Current Patterns:')
    console.log('─'.repeat(80))
    patternResult.records.forEach(record => {
      console.log(`Type: ${record.type}, Name: ${record.name}, Count: ${record.count?.toNumber() || 0}`)
      const metadata = record.metadata ? JSON.parse(record.metadata) : {}
      if (metadata.sampleEntityIds?.length > 0) {
        console.log(`  Sample Entity IDs: ${metadata.sampleEntityIds.slice(0, 3).join(', ')}...`)
      }
    })

    // Clear existing patterns to start fresh
    console.log('\n🗑️  Clearing existing Pattern nodes...')
    const deleteResult = await neo4jService.executeQuery(`
      MATCH (p:Pattern)
      DETACH DELETE p
      RETURN COUNT(p) as deleted
    `, {})
    
    console.log(`Deleted ${deleteResult.records[0]?.deleted?.toNumber() || 0} patterns`)

    // Now let's create the updated pattern-processor function that includes relationship creation
    console.log('\n📝 Creating updated storePatternBatch function...')
    
    // Create a test script to demonstrate the fix
    const fixCode = `
// Updated storePatternBatch function that creates relationships
async function storePatternBatch(session: any, patterns: any[], batchId: string) {
  if (patterns.length === 0) return
  
  for (const pattern of patterns) {
    const patternId = \`\${pattern.type}-\${pattern.pattern}-\${batchId}-\${Date.now()}-\${Math.random()}\`
    
    // Create the pattern node
    await session.run(\`
      MERGE (p:Pattern {
        pattern_type: $type,
        pattern_name: $pattern,
        scope_id: $scopeId,
        scope_data: $scopeData
      })
      ON CREATE SET
        p.id = $patternId,
        p.type = $type,
        p.name = $pattern,
        p.confidence = $confidence,
        p.frequency = $frequency,
        p.first_detected = datetime(),
        p.last_validated = datetime(),
        p.last_updated = datetime(),
        p.batch_id = $batchId,
        p.metadata = $metadata,
        p.user_id = $userId,
        p.workspace_id = $workspaceId,
        p.project = $project
      ON MATCH SET
        p.frequency = p.frequency + $frequency,
        p.confidence = CASE 
          WHEN $confidence > p.confidence THEN $confidence 
          ELSE p.confidence 
        END,
        p.last_validated = datetime(),
        p.last_updated = datetime()
    \`, {
      patternId,
      type: pattern.type,
      pattern: pattern.pattern,
      confidence: pattern.confidence,
      frequency: pattern.frequency,
      scopeId: pattern.userId || pattern.workspaceId || 'global',
      scopeData: JSON.stringify({
        project: pattern.project,
        period: pattern.day || pattern.week || 'unknown'
      }),
      metadata: JSON.stringify(pattern.metadata || {}),
      userId: pattern.userId || null,
      workspaceId: pattern.workspaceId || null,
      project: pattern.project || null,
      batchId
    })
    
    // Create relationships to source entities
    if (pattern.metadata?.sampleEntityIds && pattern.metadata.sampleEntityIds.length > 0) {
      // Create FOUND_IN relationships to EntitySummary nodes
      await session.run(\`
        MATCH (p:Pattern {id: $patternId})
        UNWIND $entityIds AS entityId
        MATCH (e:EntitySummary {id: entityId})
        MERGE (p)-[r:FOUND_IN]->(e)
        SET r.created_at = datetime()
      \`, {
        patternId,
        entityIds: pattern.metadata.sampleEntityIds
      })
      
      // Also create DERIVED_FROM relationships to the actual Memory/CodeEntity nodes
      await session.run(\`
        MATCH (p:Pattern {id: $patternId})
        UNWIND $entityIds AS summaryId
        MATCH (s:EntitySummary {id: summaryId})
        MATCH (s)-[:SUMMARIZES]->(entity)
        WHERE entity:Memory OR entity:CodeEntity
        MERGE (p)-[r:DERIVED_FROM]->(entity)
        SET r.created_at = datetime(),
            r.via_summary = summaryId
      \`, {
        patternId,
        entityIds: pattern.metadata.sampleEntityIds
      })
    }
  }
}

// Updated detectMemoryCodeRelationships to use correct relationship types
async function createMemoryCodeRelationships(session: any, memory: any, code: any, similarity: number, method: string) {
  // Create bidirectional relationships with proper types
  await session.run(\`
    MATCH (m:Memory {id: $memoryId})
    MATCH (c:CodeEntity {id: $codeId})
    WHERE NOT EXISTS((m)-[:REFERENCES_CODE]-(c))
      AND COUNT { (m)-[:REFERENCES_CODE|DISCUSSES]-() } < 25
      AND COUNT { (c)-[:REFERENCES_CODE|DISCUSSED_IN]-() } < 25
    MERGE (m)-[r:REFERENCES_CODE]->(c)
    SET r.similarity = $similarity,
        r.detected_at = datetime(),
        r.detection_method = $method
    WITH m, c
    MERGE (c)-[r2:DISCUSSED_IN]->(m)
    SET r2.similarity = $similarity,
        r2.detected_at = datetime(),
        r2.detection_method = $method
  \`, {
    memoryId: memory.id,
    codeId: code.id,
    similarity: similarity,
    method: method
  })
}
`
    
    console.log('✅ Fix code prepared. The pattern-processor function needs to be updated to:')
    console.log('1. Create FOUND_IN relationships from patterns to EntitySummary nodes')
    console.log('2. Create DERIVED_FROM relationships from patterns to Memory/CodeEntity nodes')
    console.log('3. Use REFERENCES_CODE and DISCUSSED_IN for memory-code relationships')
    
    // Let's also check if we have EntitySummary nodes with sampleEntityIds
    const summaryCheck = await neo4jService.executeQuery(`
      MATCH (e:EntitySummary)
      WHERE e.pattern_signals IS NOT NULL
      RETURN COUNT(e) as total,
             COUNT(CASE WHEN e.pattern_signals CONTAINS 'is_debugging' THEN 1 END) as debugging,
             COUNT(CASE WHEN e.pattern_signals CONTAINS 'is_learning' THEN 1 END) as learning
    `, {})
    
    const record = summaryCheck.records[0]
    console.log('\n📊 EntitySummary Stats:')
    console.log(`Total with pattern signals: ${record?.total?.toNumber() || 0}`)
    console.log(`Debugging signals: ${record?.debugging?.toNumber() || 0}`)
    console.log(`Learning signals: ${record?.learning?.toNumber() || 0}`)

  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    console.log('\n🎯 Done!')
  }
}

fixPatternRelationships()