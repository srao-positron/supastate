#!/usr/bin/env npx tsx

/**
 * Test pattern detection functions directly
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

async function testPatternFunctionsDirectly() {
  const session = driver.session()
  
  try {
    console.log('=== Testing Pattern Functions Directly ===\n')
    
    // 1. Test Learning Pattern Detection
    console.log('1. Testing Learning Pattern Detection')
    
    const learningSeeds = await session.run(`
      MATCH (e:EntitySummary)
      WHERE e.pattern_signals CONTAINS '"is_learning":true'
        AND e.embedding IS NOT NULL
      RETURN e.id as id, e.entity_id as entityId
      LIMIT 3
    `)
    
    console.log(`   Found ${learningSeeds.records.length} learning seeds`)
    
    if (learningSeeds.records.length > 0) {
      const seedId = getValue(learningSeeds.records[0], 'id')
      
      const similarResult = await session.run(`
        MATCH (seed:EntitySummary {id: $seedId})
        MATCH (e:EntitySummary)
        WHERE e.id <> seed.id
          AND e.embedding IS NOT NULL
          AND vector.similarity.cosine(seed.embedding, e.embedding) > 0.65
        RETURN count(e) as count, avg(vector.similarity.cosine(seed.embedding, e.embedding)) as avgSim
      `, { seedId })
      
      const count = similarResult.records[0].get('count').low || 0
      const avgSim = similarResult.records[0].get('avgSim')
      console.log(`   Similar entities: ${count} (avg similarity: ${avgSim?.toFixed(3)})`)
    }
    
    // 2. Test Temporal Pattern Detection
    console.log('\n2. Testing Temporal Pattern Detection')
    
    const temporalResult = await session.run(`
      MATCH (e:EntitySummary)
      WHERE e.created_at > datetime() - duration('P30D')
      WITH e.user_id as userId,
           e.project_name as project,
           toString(date(e.created_at)) as day,
           count(e) as activityCount
      WHERE activityCount >= 5
      RETURN project, day, activityCount
      ORDER BY activityCount DESC
      LIMIT 5
    `)
    
    console.log(`   Found ${temporalResult.records.length} intensive sessions`)
    temporalResult.records.forEach(record => {
      console.log(`   - ${record.get('project')} on ${record.get('day')}: ${record.get('activityCount').low || 0} activities`)
    })
    
    // 3. Test Semantic Clustering
    console.log('\n3. Testing Semantic Clustering')
    
    const projectResult = await session.run(`
      MATCH (e:EntitySummary)
      WHERE e.embedding IS NOT NULL
      RETURN DISTINCT e.project_name as project
      LIMIT 3
    `)
    
    for (const projectRecord of projectResult.records) {
      const project = getValue(projectRecord, 'project')
      
      // Get a seed from this project
      const seedResult = await session.run(`
        MATCH (e:EntitySummary)
        WHERE e.project_name = $project
          AND e.embedding IS NOT NULL
        RETURN e.id as id
        LIMIT 1
      `, { project })
      
      if (seedResult.records.length > 0) {
        const seedId = getValue(seedResult.records[0], 'id')
        
        const clusterResult = await session.run(`
          MATCH (seed:EntitySummary {id: $seedId})
          MATCH (e:EntitySummary)
          WHERE e.project_name = $project
            AND e.id <> seed.id
            AND e.embedding IS NOT NULL
            AND vector.similarity.cosine(seed.embedding, e.embedding) > 0.75
          RETURN count(e) as clusterSize,
                 avg(vector.similarity.cosine(seed.embedding, e.embedding)) as avgSimilarity
        `, { seedId, project })
        
        const size = clusterResult.records[0].get('clusterSize').low || 0
        const avgSim = clusterResult.records[0].get('avgSimilarity')
        
        console.log(`   ${project}: cluster size ${size} (avg similarity: ${avgSim?.toFixed(3)})`)
      }
    }
    
    // 4. Test Memory-Code Relationships
    console.log('\n4. Testing Memory-Code Relationships')
    
    const memCodeResult = await session.run(`
      MATCH (m:EntitySummary {entity_type: 'memory'})
      MATCH (c:EntitySummary {entity_type: 'code'})
      WHERE m.embedding IS NOT NULL
        AND c.embedding IS NOT NULL
        AND m.project_name = c.project_name
        AND vector.similarity.cosine(m.embedding, c.embedding) > 0.7
      WITH m.project_name as project, count(*) as relationships
      RETURN project, relationships
      ORDER BY relationships DESC
      LIMIT 5
    `)
    
    console.log(`   Found ${memCodeResult.records.length} projects with memory-code relationships`)
    memCodeResult.records.forEach(record => {
      console.log(`   - ${record.get('project')}: ${record.get('relationships').low || 0} relationships`)
    })
    
    // SQL query for logs
    console.log('\n\n=== Check Edge Function Logs ===')
    console.log('Run this SQL in Supabase Dashboard:\n')
    console.log(`
SELECT 
  timestamp,
  event_message
FROM function_logs
CROSS JOIN unnest(metadata) as metadata
WHERE metadata.function_id = 'pattern-processor'
  AND timestamp > NOW() - INTERVAL '30 minutes'
  AND (event_message LIKE '%Starting%pattern detection%'
       OR event_message LIKE '%Found%seeds%'
       OR event_message LIKE '%Creating%pattern%'
       OR event_message LIKE '%error%'
       OR event_message LIKE '%Error%')
ORDER BY timestamp DESC
LIMIT 100;
    `)
    
  } finally {
    await session.close()
    await driver.close()
  }
}

testPatternFunctionsDirectly().catch(console.error)