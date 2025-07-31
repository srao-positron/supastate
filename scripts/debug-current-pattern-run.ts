#!/usr/bin/env npx tsx

/**
 * Debug current pattern run
 */

import * as dotenv from 'dotenv'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
)

async function debugCurrentPatternRun() {
  const session = driver.session()
  
  try {
    console.log('=== Debugging Pattern Detection ===\n')
    
    // 1. Check if we have EntitySummaries
    const summaryCount = await session.run(`
      MATCH (e:EntitySummary)
      RETURN count(e) as total,
             count(CASE WHEN e.embedding IS NOT NULL THEN 1 END) as withEmbedding,
             count(CASE WHEN e.pattern_signals CONTAINS '"is_debugging":true' THEN 1 END) as debugging
    `)
    
    const counts = summaryCount.records[0]
    console.log(`EntitySummary nodes: ${counts.get('total').low || 0}`)
    console.log(`  With embeddings: ${counts.get('withEmbedding').low || 0}`)
    console.log(`  Marked as debugging: ${counts.get('debugging').low || 0}`)
    
    // 2. Test vector similarity directly
    console.log('\n=== Testing Vector Similarity ===')
    
    // Get a debugging seed
    const seedResult = await session.run(`
      MATCH (e:EntitySummary)
      WHERE e.pattern_signals CONTAINS '"is_debugging":true'
        AND e.embedding IS NOT NULL
      RETURN e.id as id, e.entity_id as entityId, e.project_name as project
      LIMIT 1
    `)
    
    if (seedResult.records.length > 0) {
      const seedId = seedResult.records[0].get('id')
      const seedEntityId = seedResult.records[0].get('entityId')
      const seedProject = seedResult.records[0].get('project')
      
      console.log(`\nSeed: ${seedEntityId} (${seedProject})`)
      
      // Find similar using vector.similarity.cosine
      const similarResult = await session.run(`
        MATCH (seed:EntitySummary {id: $seedId})
        MATCH (e:EntitySummary)
        WHERE e.id <> seed.id
          AND e.embedding IS NOT NULL
          AND seed.embedding IS NOT NULL
          AND vector.similarity.cosine(seed.embedding, e.embedding) > 0.65
        WITH e, 
             vector.similarity.cosine(seed.embedding, e.embedding) as similarity,
             toString(date(e.created_at)) as day
        RETURN e.entity_id as entityId,
               e.project_name as project,
               similarity,
               day
        ORDER BY similarity DESC
        LIMIT 20
      `, { seedId })
      
      console.log(`\nFound ${similarResult.records.length} similar entities with similarity > 0.65:`)
      
      // Group by project to show distribution
      const byProject = new Map<string, number>()
      
      similarResult.records.forEach((record, idx) => {
        const project = record.get('project')
        const similarity = record.get('similarity')
        const entityId = record.get('entityId')
        
        byProject.set(project, (byProject.get(project) || 0) + 1)
        
        if (idx < 5) {
          console.log(`${idx + 1}. ${project} - ${entityId}`)
          console.log(`   Similarity: ${similarity.toFixed(4)}`)
        }
      })
      
      console.log('\nDistribution by project:')
      Array.from(byProject.entries()).forEach(([project, count]) => {
        console.log(`  ${project}: ${count} entities`)
      })
      
      // Check if pattern would be created
      console.log('\n=== Checking Pattern Creation Logic ===')
      
      // Group by user/project/week (same as pattern processor)
      const groupedResults = new Map<string, any>()
      
      for (const record of similarResult.records) {
        const entity = await session.run(`
          MATCH (e:EntitySummary {entity_id: $entityId})
          RETURN e
        `, { entityId: record.get('entityId') })
        
        if (entity.records.length > 0) {
          const props = entity.records[0].get('e').properties
          const day = record.get('day')
          const weekStart = day ? day.substring(0, 8) + '01' : 'unknown'
          const key = `${props.user_id || 'unknown'}|${props.project_name || 'unknown'}|week-${weekStart}`
          
          if (!groupedResults.has(key)) {
            groupedResults.set(key, {
              project: props.project_name,
              week: weekStart,
              count: 0,
              similarities: []
            })
          }
          
          const group = groupedResults.get(key)!
          group.count++
          group.similarities.push(record.get('similarity'))
        }
      }
      
      console.log(`\nGrouped into ${groupedResults.size} groups:`)
      groupedResults.forEach((group, key) => {
        const avgSim = group.similarities.reduce((a: number, b: number) => a + b, 0) / group.count
        console.log(`  ${key}:`)
        console.log(`    Count: ${group.count}`)
        console.log(`    Avg similarity: ${avgSim.toFixed(4)}`)
        console.log(`    Would create pattern: ${group.count >= 3 ? 'YES' : 'NO (need 3+)'}`)
      })
    }
    
    // 3. Show SQL for checking logs
    console.log('\n\n=== Check Edge Function Logs ===')
    console.log('Run this SQL in Supabase Dashboard:')
    console.log(`
SELECT 
  timestamp,
  event_message
FROM function_logs
CROSS JOIN unnest(metadata) as metadata
WHERE metadata.function_id = 'pattern-processor'
  AND timestamp > NOW() - INTERVAL '10 minutes'
  AND (event_message LIKE '%vector.similarity%' 
       OR event_message LIKE '%Found%similar%'
       OR event_message LIKE '%Creating semantic pattern%'
       OR event_message LIKE '%error%')
ORDER BY timestamp DESC
LIMIT 50;
    `)
    
  } finally {
    await session.close()
    await driver.close()
  }
}

debugCurrentPatternRun().catch(console.error)