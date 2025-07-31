#!/usr/bin/env npx tsx

/**
 * Debug why semantic patterns aren't being created despite finding similarities
 */

import * as dotenv from 'dotenv'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
)

async function debugSemanticGrouping() {
  const session = driver.session()
  
  try {
    console.log('=== Debugging Semantic Pattern Grouping ===\n')
    
    // Get a debugging seed
    const seedResult = await session.run(`
      MATCH (e:EntitySummary)
      WHERE e.pattern_signals CONTAINS '"is_debugging":true'
        AND e.embedding IS NOT NULL
      RETURN e.id as id, e.project_name as project, e.created_at as created_at
      ORDER BY e.created_at DESC
      LIMIT 1
    `)
    
    if (seedResult.records.length === 0) {
      console.log('No debugging seeds found')
      return
    }
    
    const seedId = seedResult.records[0].get('id')
    const seedProject = seedResult.records[0].get('project')
    const seedDate = seedResult.records[0].get('created_at')
    
    console.log(`Seed entity: ${seedId}`)
    console.log(`Project: ${seedProject}`)
    console.log(`Created: ${seedDate}`)
    
    // Find similar entities and analyze their distribution
    const similarResult = await session.run(`
      MATCH (seed:EntitySummary {id: $seedId})
      MATCH (e:EntitySummary)
      WHERE e.id <> seed.id
        AND e.embedding IS NOT NULL
        AND seed.embedding IS NOT NULL
      WITH e, seed, gds.similarity.cosine(seed.embedding, e.embedding) as similarity
      WHERE similarity > 0.65
      RETURN e.id as id,
             e.user_id as userId,
             e.workspace_id as workspaceId,
             e.project_name as project,
             toString(date(e.created_at)) as day,
             e.created_at as created_at,
             similarity
      ORDER BY similarity DESC
      LIMIT 50
    `, { seedId })
    
    console.log(`\nFound ${similarResult.records.length} similar entities\n`)
    
    // Group by user/project/day to see distribution
    const groups = new Map<string, any[]>()
    
    similarResult.records.forEach(record => {
      const userId = record.get('userId')
      const project = record.get('project')
      const day = record.get('day')
      const key = `${userId}-${project}-${day}`
      
      if (!groups.has(key)) {
        groups.set(key, [])
      }
      
      groups.get(key)!.push({
        id: record.get('id'),
        similarity: record.get('similarity'),
        created_at: record.get('created_at')
      })
    })
    
    console.log('Grouping results:')
    console.log(`Total unique groups: ${groups.size}`)
    console.log('\nGroups with 3+ entities (would create patterns):')
    
    let patternsFound = 0
    groups.forEach((entities, key) => {
      if (entities.length >= 3) {
        patternsFound++
        console.log(`\n  Group ${patternsFound}: ${key}`)
        console.log(`    Count: ${entities.length}`)
        console.log(`    Similarities: ${entities.map(e => e.similarity.toFixed(3)).join(', ')}`)
      }
    })
    
    if (patternsFound === 0) {
      console.log('  None found! This explains why no semantic patterns are created.')
      
      // Show distribution to understand why
      console.log('\n\nDistribution of all groups:')
      const distribution = new Map<number, number>()
      groups.forEach(entities => {
        const count = entities.length
        distribution.set(count, (distribution.get(count) || 0) + 1)
      })
      
      Array.from(distribution.entries())
        .sort((a, b) => b[0] - a[0])
        .forEach(([count, numGroups]) => {
          console.log(`  Groups with ${count} entities: ${numGroups}`)
        })
      
      // Show some sample groups
      console.log('\n\nSample groups (first 5):')
      let shown = 0
      groups.forEach((entities, key) => {
        if (shown < 5) {
          console.log(`\n  ${key}: ${entities.length} entities`)
          entities.slice(0, 3).forEach(e => {
            console.log(`    - similarity: ${e.similarity.toFixed(3)}, created: ${e.created_at}`)
          })
          shown++
        }
      })
    }
    
    // Check if the issue is temporal - are similar memories spread across days?
    console.log('\n\n=== Temporal Distribution Analysis ===')
    
    const dayDistribution = new Map<string, number>()
    const projectDistribution = new Map<string, number>()
    
    similarResult.records.forEach(record => {
      const day = record.get('day')
      const project = record.get('project')
      
      dayDistribution.set(day, (dayDistribution.get(day) || 0) + 1)
      projectDistribution.set(project, (projectDistribution.get(project) || 0) + 1)
    })
    
    console.log('\nSimilar entities by day:')
    Array.from(dayDistribution.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([day, count]) => {
        console.log(`  ${day}: ${count} entities`)
      })
    
    console.log('\nSimilar entities by project:')
    Array.from(projectDistribution.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([project, count]) => {
        console.log(`  ${project}: ${count} entities`)
      })
    
  } finally {
    await session.close()
    await driver.close()
  }
}

debugSemanticGrouping().catch(console.error)