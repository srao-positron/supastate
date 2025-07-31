import { createClient } from '@supabase/supabase-js'
import neo4j from 'neo4j-driver'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
)

async function main() {
  const session = driver.session()
  
  try {
    console.log('=== Analyzing Duplicate EntitySummary Types ===\n')
    
    // Get duplicate statistics by entity type
    const statsResult = await session.run(`
      MATCH (es:EntitySummary)
      WITH es.entity_id as entityId, es.entity_type as entityType, count(*) as count
      WHERE count > 1
      RETURN entityType, count(distinct entityId) as uniqueEntities, sum(count) as totalNodes, avg(count) as avgDuplicates
      ORDER BY totalNodes DESC
    `)
    
    console.log('Duplicate Summary by Type:')
    console.log('-------------------------')
    for (const record of statsResult.records) {
      const type = record.get('entityType')
      const unique = record.get('uniqueEntities')
      const total = record.get('totalNodes')
      const avg = record.get('avgDuplicates')
      console.log(`${type}: ${unique} entities with ${total} total nodes (avg ${avg.toFixed(1)} copies per entity)`)
    }
    
    // Get worst offenders by type
    console.log('\n\nWorst Duplicate Cases:')
    console.log('----------------------')
    
    const worstResult = await session.run(`
      MATCH (es:EntitySummary)
      WITH es.entity_id as entityId, es.entity_type as entityType, count(*) as count
      WHERE count > 5
      RETURN entityId, entityType, count
      ORDER BY count DESC
      LIMIT 10
    `)
    
    for (const record of worstResult.records) {
      const entityId = record.get('entityId')
      const type = record.get('entityType')
      const count = record.get('count')
      
      // Check if this entity exists in the source
      if (type === 'memory') {
        const { data: memory } = await supabase
          .from('memories')
          .select('id, content')
          .eq('id', entityId)
          .single()
        
        if (memory) {
          console.log(`\n${type} (${count} copies): ${entityId}`)
          console.log(`  Content: ${memory.content?.substring(0, 80)}...`)
        } else {
          console.log(`\n${type} (${count} copies): ${entityId} - NOT FOUND IN SUPABASE`)
        }
      } else if (type === 'code') {
        const { data: code } = await supabase
          .from('code_entities')
          .select('id, name, file_path')
          .eq('id', entityId)
          .single()
        
        if (code) {
          console.log(`\n${type} (${count} copies): ${entityId}`)
          console.log(`  File: ${code.file_path} - ${code.name}`)
        } else {
          console.log(`\n${type} (${count} copies): ${entityId} - NOT FOUND IN SUPABASE`)
        }
      }
    }
    
    // Check creation timestamps
    console.log('\n\nCreation Time Analysis:')
    console.log('----------------------')
    
    const timeResult = await session.run(`
      MATCH (es:EntitySummary)
      WITH es.entity_id as entityId, es.entity_type as entityType, count(*) as count
      WHERE count > 5
      WITH entityId, entityType, count
      LIMIT 1
      MATCH (es:EntitySummary {entity_id: entityId})
      RETURN entityId, entityType, collect(es.created_at) as timestamps
    `)
    
    if (timeResult.records.length > 0) {
      const record = timeResult.records[0]
      const entityId = record.get('entityId')
      const type = record.get('entityType')
      const timestamps = record.get('timestamps')
      
      console.log(`\nExample entity ${entityId} (${type}) created at:`)
      timestamps.sort().forEach((ts: string) => {
        console.log(`  - ${new Date(ts).toISOString()}`)
      })
      
      // Calculate time differences
      const times = timestamps.map((ts: string) => new Date(ts).getTime()).sort()
      const diffs = []
      for (let i = 1; i < times.length; i++) {
        diffs.push(times[i] - times[i-1])
      }
      
      console.log(`\nTime differences between creations:`)
      diffs.forEach((diff, i) => {
        console.log(`  ${i+1}: ${diff}ms`)
      })
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

main().catch(console.error)