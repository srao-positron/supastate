import { createClient } from '@supabase/supabase-js'
import neo4j from 'neo4j-driver'

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
    console.log('=== Investigating Duplicate EntitySummary Creation ===\n')
    
    // Check for duplicate EntitySummary nodes
    const duplicateResult = await session.run(`
      MATCH (es:EntitySummary)
      WITH es.entity_id as entityId, es.entity_type as entityType, count(*) as count
      WHERE count > 1
      RETURN entityId, entityType, count
      ORDER BY count DESC
      LIMIT 10
    `)
    
    if (duplicateResult.records.length > 0) {
      console.log('Found duplicate EntitySummary nodes:')
      for (const record of duplicateResult.records) {
        console.log(`- Entity ${record.get('entityId')} (${record.get('entityType')}): ${record.get('count')} copies`)
      }
      console.log()
    } else {
      console.log('No duplicate EntitySummary nodes found\n')
    }
    
    // Check recent ingestion logs for EntitySummary creation
    const { data: logs, error } = await supabase
      .from('function_logs')
      .select('*')
      .or('event_message.ilike.%EntitySummary%,event_message.ilike.%entity summary%')
      .gte('timestamp', new Date(Date.now() - 30 * 60 * 1000).toISOString())
      .order('timestamp', { ascending: false })
      .limit(20)
      
    if (logs && logs.length > 0) {
      console.log('\nRecent EntitySummary creation logs:')
      logs.forEach(log => {
        const time = new Date(log.timestamp).toLocaleTimeString()
        console.log(`[${time}] ${log.event_message}`)
      })
    }
    
    // Check if unique constraint exists
    const constraintResult = await session.run(`
      SHOW CONSTRAINTS
    `)
    
    console.log('\n\nExisting constraints:')
    for (const record of constraintResult.records) {
      const name = record.get('name')
      if (name && name.includes('entity')) {
        console.log(`- ${name}`)
      }
    }
    
    // Check pattern detection coordinator logs
    const { data: patternLogs } = await supabase
      .from('function_logs')
      .select('*')
      .eq('function_name', 'pattern-detection-coordinator')
      .gte('timestamp', new Date(Date.now() - 30 * 60 * 1000).toISOString())
      .order('timestamp', { ascending: false })
      .limit(10)
      
    if (patternLogs && patternLogs.length > 0) {
      console.log('\n\nPattern detection coordinator activity:')
      patternLogs.forEach(log => {
        const time = new Date(log.timestamp).toLocaleTimeString()
        console.log(`[${time}] ${log.event_message}`)
      })
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

main().catch(console.error)