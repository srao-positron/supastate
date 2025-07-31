#!/usr/bin/env npx tsx

/**
 * Debug the pattern processor logic step by step
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

async function debugPatternProcessor() {
  const session = driver.session()
  
  try {
    console.log('=== Debugging Pattern Processor Logic ===\n')
    
    // 1. Get debugging seeds (same as pattern processor)
    const debugSeeds = await session.run(`
      MATCH (e:EntitySummary)
      WHERE e.pattern_signals CONTAINS '"is_debugging":true'
        AND e.embedding IS NOT NULL
      RETURN e.id as id, e.embedding as embedding
      ORDER BY e.created_at DESC
      LIMIT 10
    `)
    
    console.log(`Found ${debugSeeds.records.length} debugging seeds`)
    
    if (debugSeeds.records.length === 0) {
      console.log('No debugging seeds found!')
      return
    }
    
    // 2. Process first seed
    const seedRecord = debugSeeds.records[0]
    const seedId = getValue(seedRecord, 'id')
    console.log(`\nProcessing seed: ${seedId}`)
    
    // 3. Find similar entities (exact query from pattern processor)
    const similarResult = await session.run(`
      MATCH (seed:EntitySummary {id: $seedId})
      MATCH (e:EntitySummary)
      WHERE e.id <> seed.id
        AND e.embedding IS NOT NULL
        AND seed.embedding IS NOT NULL
      WITH seed, e,
           seed.embedding as v1,
           e.embedding as v2,
           toString(date(e.created_at)) as day
      WITH e, day,
           reduce(dot = 0.0, i IN range(0, size(v1)-1) | dot + v1[i] * v2[i]) as dotProduct,
           sqrt(reduce(sum = 0.0, val IN v1 | sum + val * val)) as norm1,
           sqrt(reduce(sum = 0.0, val IN v2 | sum + val * val)) as norm2
      WITH e, day,
           CASE 
             WHEN norm1 = 0 OR norm2 = 0 THEN 0 
             ELSE dotProduct / (norm1 * norm2) 
           END as similarity
      WHERE similarity > 0.5
      RETURN e, similarity, day
      ORDER BY similarity DESC
      LIMIT 100
    `, { seedId })
    
    console.log(`Found ${similarResult.records.length} similar entities`)
    
    // 4. Group by project and week
    const groupedResults = new Map<string, any>()
    
    for (const record of similarResult.records) {
      const entity = getValue(record, 'e')?.properties
      const similarity = getValue(record, 'similarity')
      const day = getValue(record, 'day')
      
      if (!entity) {
        console.log('Skipping record without entity')
        continue
      }
      
      // Convert day to week start
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
      group.entities.push({
        id: entity.id,
        similarity: similarity,
        day: day
      })
    }
    
    console.log(`\nGrouped into ${groupedResults.size} groups:`)
    
    // 5. Check which groups would create patterns
    let wouldCreatePatterns = 0
    groupedResults.forEach((group, key) => {
      console.log(`\n  ${key}:`)
      console.log(`    Count: ${group.count}`)
      console.log(`    Avg similarity: ${(group.totalSimilarity / group.count).toFixed(3)}`)
      
      if (group.count >= 3) {
        wouldCreatePatterns++
        console.log(`    ✅ Would create pattern!`)
        console.log(`    Sample entities:`)
        group.entities.slice(0, 3).forEach((e: any) => {
          console.log(`      - ${e.id} (sim: ${e.similarity.toFixed(3)}, day: ${e.day})`)
        })
      } else {
        console.log(`    ❌ Not enough entities (need 3+)`)
      }
    })
    
    console.log(`\n\nSummary: Would create ${wouldCreatePatterns} semantic patterns`)
    
    // 6. Check if patterns already exist
    if (wouldCreatePatterns > 0) {
      console.log('\nChecking if patterns already exist...')
      const firstGroup = Array.from(groupedResults.values()).find(g => g.count >= 3)
      if (firstGroup) {
        const scopeData = JSON.stringify({
          project: firstGroup.project,
          period: firstGroup.week
        })
        
        const existingPattern = await session.run(`
          MATCH (p:PatternSummary)
          WHERE p.pattern_type = 'debugging'
            AND p.pattern_name = 'debugging-session-semantic'
            AND p.scope_data = $scopeData
          RETURN p
        `, { scopeData })
        
        if (existingPattern.records.length > 0) {
          console.log('⚠️  Pattern already exists for this scope!')
          const pattern = existingPattern.records[0].get('p').properties
          console.log(`  ID: ${pattern.id}`)
          console.log(`  Frequency: ${pattern.frequency}`)
          console.log(`  Last updated: ${pattern.last_updated}`)
        } else {
          console.log('✅ No existing pattern found - should be created')
        }
      }
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

debugPatternProcessor().catch(console.error)