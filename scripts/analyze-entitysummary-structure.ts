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
    console.log('=== Analyzing EntitySummary Structure ===\n')
    
    // Get a sample of EntitySummary nodes with duplicates
    const dupResult = await session.run(`
      MATCH (es:EntitySummary)
      WITH es.entity_id as entityId, count(*) as count
      WHERE count > 5
      WITH entityId, count
      LIMIT 1
      MATCH (es:EntitySummary {entity_id: entityId})
      RETURN es, entityId, count
      LIMIT 5
    `)
    
    if (dupResult.records.length === 0) {
      console.log('No duplicates found')
      return
    }
    
    const entityId = dupResult.records[0].get('entityId')
    const count = dupResult.records[0].get('count')
    
    console.log(`Analyzing entity ${entityId} with ${count} duplicates:\n`)
    
    // Analyze each duplicate
    dupResult.records.forEach((record, idx) => {
      const node = record.get('es')
      console.log(`\n--- Duplicate ${idx + 1} ---`)
      console.log('Properties:')
      Object.entries(node.properties).forEach(([key, value]) => {
        if (key === 'embedding' && Array.isArray(value)) {
          console.log(`  ${key}: [array of ${value.length} floats]`)
        } else if ((key === 'summary' || key === 'content') && typeof value === 'string') {
          console.log(`  ${key}: ${value.substring(0, 100)}...`)
        } else {
          console.log(`  ${key}: ${value}`)
        }
      })
    })
    
    // Check what's creating these
    console.log('\n\n=== Checking Creation Pattern ===')
    
    // Look for the source Memory
    const memResult = await session.run(`
      MATCH (m:Memory {id: $entityId})
      RETURN m
    `, { entityId })
    
    if (memResult.records.length > 0) {
      console.log('\nFound source Memory node:')
      const memory = memResult.records[0].get('m')
      console.log(`  Created: ${memory.properties.created_at}`)
      console.log(`  Has embedding: ${!!memory.properties.embedding}`)
    }
    
    // Check the creation code
    console.log('\n\n=== Recent EntitySummary Creation Logs ===')
    const { data: logs } = await supabase
      .from('pattern_processor_logs')
      .select('*')
      .or('message.ilike.%Creating entity summary%,message.ilike.%EntitySummary%')
      .order('timestamp', { ascending: false })
      .limit(10)
    
    if (logs && logs.length > 0) {
      logs.forEach(log => {
        const time = new Date(log.timestamp).toLocaleTimeString()
        console.log(`[${time}] ${log.message}`)
      })
    } else {
      console.log('No EntitySummary creation logs found')
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

main().catch(console.error)