#!/usr/bin/env npx tsx

/**
 * Test pattern creation with vector index approach
 */

import * as dotenv from 'dotenv'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
)

// Helper to get value from Neo4j record
function getValue(record: any, key: string): any {
  if (!record || !record._fields || !record._fieldLookup) return null
  const index = record._fieldLookup[key]
  if (index === undefined) return null
  return record._fields[index]
}

async function testVectorPatternCreation() {
  const session = driver.session()
  
  try {
    console.log('=== Testing Vector-based Pattern Creation ===\n')
    
    // Get a debugging seed
    const seedResult = await session.run(`
      MATCH (e:EntitySummary)
      WHERE e.pattern_signals CONTAINS '"is_debugging":true'
        AND e.embedding IS NOT NULL
      RETURN e.id as id, e.embedding as embedding
      LIMIT 1
    `)
    
    if (seedResult.records.length === 0) {
      console.log('No debugging seed found')
      return
    }
    
    const seedId = seedResult.records[0].get('id')
    const seedEmbedding = seedResult.records[0].get('embedding')
    
    console.log(`Using seed: ${seedId}`)
    
    // Use vector index search
    console.log('\nSearching similar entities...')
    const similarResult = await session.run(`
      CALL db.index.vector.queryNodes(
        'entity_summary_embedding',
        100,
        $embedding
      ) YIELD node, score
      WHERE node.id <> $seedId
        AND score > 0.5
      WITH node as e, score as similarity, toString(date(node.created_at)) as day
      RETURN e, similarity, day
      ORDER BY similarity DESC
    `, {
      seedId,
      embedding: seedEmbedding
    })
    
    console.log(`Found ${similarResult.records.length} similar entities`)
    
    // Group results
    const groupedResults = new Map<string, any>()
    
    for (const record of similarResult.records) {
      const entity = getValue(record, 'e')?.properties
      const similarity = getValue(record, 'similarity')
      const day = getValue(record, 'day')
      
      if (!entity) continue
      
      const weekStart = day ? day.substring(0, 8) + '01' : 'unknown'
      const key = `${entity.user_id || 'unknown'}|${entity.project_name || 'unknown'}|week-${weekStart}`
      
      if (!groupedResults.has(key)) {
        groupedResults.set(key, {
          userId: entity.user_id,
          workspaceId: entity.workspace_id,
          project: entity.project_name,
          week: weekStart,
          count: 0,
          totalSimilarity: 0,
          entities: []
        })
      }
      
      const group = groupedResults.get(key)!
      group.count++
      group.totalSimilarity += similarity
      group.entities.push(entity.id)
    }
    
    console.log(`\nGrouped into ${groupedResults.size} groups:`)
    
    // Would create patterns?
    let wouldCreate = 0
    groupedResults.forEach((group, key) => {
      if (group.count >= 3) {
        wouldCreate++
        console.log(`\n✅ ${key}:`)
        console.log(`   Count: ${group.count}`)
        console.log(`   Avg similarity: ${(group.totalSimilarity / group.count).toFixed(3)}`)
      }
    })
    
    console.log(`\nWould create ${wouldCreate} semantic patterns`)
    
    // Create one pattern manually
    if (wouldCreate > 0) {
      const firstGroup = Array.from(groupedResults.values()).find(g => g.count >= 3)
      if (firstGroup) {
        console.log('\nCreating test pattern...')
        
        const batchId = 'test-' + Date.now()
        const patternId = `debugging-semantic-${batchId}`
        
        await session.run(`
          MERGE (p:PatternSummary {
            pattern_type: 'debugging',
            pattern_name: 'debugging-session-semantic',
            scope_id: $scopeId,
            scope_data: $scopeData
          })
          ON CREATE SET
            p.id = $patternId,
            p.confidence = $confidence,
            p.frequency = $frequency,
            p.first_detected = datetime(),
            p.last_validated = datetime(),
            p.last_updated = datetime(),
            p.batch_id = $batchId,
            p.metadata = $metadata
          ON MATCH SET
            p.frequency = p.frequency + $frequency,
            p.last_updated = datetime()
        `, {
          patternId,
          scopeId: firstGroup.userId || 'unknown',
          scopeData: JSON.stringify({
            project: firstGroup.project,
            period: firstGroup.week
          }),
          confidence: 0.8,
          frequency: firstGroup.count,
          metadata: JSON.stringify({
            detectionMethod: 'semantic',
            avgSimilarity: firstGroup.totalSimilarity / firstGroup.count,
            test: true
          }),
          batchId
        })
        
        console.log('Pattern created successfully!')
        
        // Verify it was created
        const verifyResult = await session.run(`
          MATCH (p:PatternSummary)
          WHERE p.batch_id = $batchId
          RETURN p
        `, { batchId })
        
        if (verifyResult.records.length > 0) {
          const pattern = verifyResult.records[0].get('p').properties
          console.log('\nCreated pattern:')
          console.log(`  Type: ${pattern.pattern_type}`)
          console.log(`  Name: ${pattern.pattern_name}`)
          console.log(`  Frequency: ${pattern.frequency}`)
        }
      }
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

testVectorPatternCreation().catch(console.error)