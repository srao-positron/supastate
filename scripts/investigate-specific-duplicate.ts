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
    // Look at the entity with 13 duplicates
    const entityId = '383a716d-61f5-4ff4-bbd2-38654b85791c'
    const duplicateTime = '2025-01-28T20:48:05'
    
    console.log(`=== Investigating Duplicate EntitySummary for entity ${entityId} ===\n`)
    
    // Get all the duplicate EntitySummary nodes
    const dupResult = await session.run(`
      MATCH (es:EntitySummary {entity_id: $entityId})
      RETURN es.id as summaryId, es.created_at as createdAt, es.embedding[0..3] as embeddingStart
      ORDER BY es.created_at
    `, { entityId })
    
    console.log(`Found ${dupResult.records.length} EntitySummary nodes:`)
    dupResult.records.forEach(record => {
      console.log(`- ${record.get('summaryId')} at ${record.get('createdAt')}`)
    })
    
    // Check pattern detection logs around that time
    console.log('\n=== Pattern Detection Logs Around 8:48:05 PM ===')
    const { data: patternLogs } = await supabase
      .from('function_logs')
      .select('*')
      .gte('timestamp', '2025-01-28T20:47:00')
      .lte('timestamp', '2025-01-28T20:49:00')
      .or('event_message.ilike.%383a716d-61f5-4ff4-bbd2-38654b85791c%,event_message.ilike.%pattern detection%,event_message.ilike.%EntitySummary%,event_message.ilike.%Creating embeddings%')
      .order('timestamp', { ascending: true })
    
    if (patternLogs) {
      console.log(`\nFound ${patternLogs.length} relevant logs:`)
      patternLogs.forEach(log => {
        const time = new Date(log.timestamp).toLocaleTimeString()
        console.log(`[${time}] ${log.function_name}: ${log.event_message}`)
      })
    }
    
    // Check for concurrent pattern detection workers
    console.log('\n=== Pattern Detection Workers Around That Time ===')
    const { data: workerLogs } = await supabase
      .from('function_logs')
      .select('*')
      .gte('timestamp', '2025-01-28T20:47:00')
      .lte('timestamp', '2025-01-28T20:49:00')
      .or('event_message.ilike.%pattern detection worker started%,event_message.ilike.%pattern-detection-worker%,event_message.ilike.%Spawned pattern detection worker%')
      .order('timestamp', { ascending: true })
    
    if (workerLogs) {
      console.log(`\nFound ${workerLogs.length} worker start logs:`)
      workerLogs.forEach(log => {
        const time = new Date(log.timestamp).toLocaleTimeString()
        console.log(`[${time}] ${log.function_name}: ${log.event_message}`)
      })
    }
    
    // Check for pattern processor batch IDs
    console.log('\n=== Pattern Processor Batches ===')
    const { data: batchLogs } = await supabase
      .from('function_logs')
      .select('*')
      .gte('timestamp', '2025-01-28T20:47:00')
      .lte('timestamp', '2025-01-28T20:49:00')
      .ilike('event_message', '%batch%')
      .order('timestamp', { ascending: true })
      .limit(20)
    
    if (batchLogs) {
      const batchIds = new Set()
      batchLogs.forEach(log => {
        const match = log.event_message.match(/batch[_-]?id[:\s]+([a-f0-9-]+)/i)
        if (match) {
          batchIds.add(match[1])
        }
      })
      console.log(`\nUnique batch IDs found: ${batchIds.size}`)
      batchIds.forEach(id => console.log(`- ${id}`))
    }
    
    // Look for the actual memory that triggered this
    const { data: memory } = await supabase
      .from('memories')
      .select('*')
      .eq('id', entityId)
      .single()
      
    if (memory) {
      console.log(`\n=== Memory Details ===`)
      console.log(`ID: ${memory.id}`)
      console.log(`Created: ${new Date(memory.created_at).toLocaleString()}`)
      console.log(`Workspace: ${memory.workspace_id}`)
      console.log(`User: ${memory.user_id}`)
      console.log(`Content preview: ${memory.content?.substring(0, 100)}...`)
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

main().catch(console.error)