#!/usr/bin/env npx tsx

/**
 * Test pattern detection directly without edge function
 */

import * as dotenv from 'dotenv'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

// Helper to safely convert Neo4j integers
function toNumber(value: any): number {
  if (value == null) return 0
  if (typeof value === 'number') return value
  if (value.low !== undefined) return value.low
  if (value.toNumber) return value.toNumber()
  return Number(value) || 0
}

// Helper to get value from Neo4j record by key
function getValue(record: any, key: string): any {
  if (!record || !record._fields || !record._fieldLookup) {
    return null
  }
  const index = record._fieldLookup[key]
  if (index === undefined) return null
  return record._fields[index]
}

async function testPatternDetection() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
  )
  
  const session = driver.session()
  
  try {
    console.log('=== Testing Pattern Detection Directly ===\n')
    
    // Get some debugging seeds
    const debugSeeds = await session.run(`
      MATCH (e:EntitySummary)
      WHERE e.pattern_signals CONTAINS '"is_debugging":true'
        AND e.embedding IS NOT NULL
      RETURN e.id as id, e.embedding as embedding
      ORDER BY e.created_at DESC
      LIMIT 3
    `)
    
    console.log(`Found ${debugSeeds.records.length} debugging seeds`)
    
    if (debugSeeds.records.length === 0) {
      console.log('No debugging seeds found')
      return
    }
    
    const patterns: any[] = []
    
    // Process first seed
    const seedRecord = debugSeeds.records[0]
    const seedEmbedding = getValue(seedRecord, 'embedding')
    const seedId = getValue(seedRecord, 'id')
    
    if (!seedEmbedding || !seedId) {
      console.log('Seed missing embedding or ID')
      return
    }
    
    console.log(`\nProcessing seed: ${seedId}`)
    
    // Find similar entities
    const similarResult = await session.run(`
      MATCH (seed:EntitySummary {id: $seedId})
      MATCH (e:EntitySummary)
      WHERE e.id <> seed.id
        AND e.embedding IS NOT NULL
        AND seed.embedding IS NOT NULL
      WITH e, 
           gds.similarity.cosine(seed.embedding, e.embedding) as similarity,
           toString(date(e.created_at)) as day
      WHERE similarity > 0.5  // Lower threshold
      RETURN e, similarity, day
      ORDER BY similarity DESC
      LIMIT 200  // More results
    `, { seedId })
    
    console.log(`Found ${similarResult.records.length} similar entities`)
    
    // Group by user/project/day
    const groupedResults = new Map<string, any>()
    
    for (const record of similarResult.records) {
      const entity = getValue(record, 'e')?.properties
      const similarity = getValue(record, 'similarity')
      const day = getValue(record, 'day')
      
      if (!entity) continue
      
      // Try weekly grouping instead of daily
      const weekStart = day ? day.substring(0, 8) + '01' : 'unknown'
      const key = `${entity.user_id || 'unknown'}|${entity.project_name || 'unknown'}|week-${weekStart}`
      
      if (!groupedResults.has(key)) {
        groupedResults.set(key, {
          userId: entity.user_id,
          workspaceId: entity.workspace_id,
          project: entity.project_name,
          day: day,
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
    
    console.log(`\nGrouped into ${groupedResults.size} groups`)
    
    // Create patterns from groups
    groupedResults.forEach((group, key) => {
      console.log(`  ${key}: ${group.count} entities`)
      
      if (group.count >= 3) {
        patterns.push({
          type: 'debugging',
          pattern: 'debugging-session-semantic',
          userId: group.userId,
          workspaceId: group.workspaceId,
          project: group.project,
          day: group.day,
          confidence: Math.min((group.totalSimilarity / group.count) * (group.count / 10), 0.95),
          frequency: group.count,
          metadata: {
            avgSimilarity: group.totalSimilarity / group.count,
            detectionMethod: 'semantic',
            sampleEntityIds: group.entities.slice(0, 5)
          }
        })
      }
    })
    
    console.log(`\nWould create ${patterns.length} semantic patterns`)
    
    if (patterns.length > 0) {
      console.log('\nSample pattern:')
      const sample = patterns[0]
      console.log(`  Type: ${sample.type}`)
      console.log(`  Pattern: ${sample.pattern}`)
      console.log(`  Project: ${sample.project}`)
      console.log(`  Day: ${sample.day}`)
      console.log(`  Confidence: ${sample.confidence}`)
      console.log(`  Frequency: ${sample.frequency}`)
      console.log(`  Avg Similarity: ${sample.metadata.avgSimilarity}`)
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

testPatternDetection().catch(console.error)