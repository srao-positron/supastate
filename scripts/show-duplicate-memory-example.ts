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
    // Look at the memory with 15 duplicates
    const memoryId = 'fbe9c945-ee0a-42f6-96d7-c8cbaa8cfbc8'
    
    console.log('=== Memory with 15 EntitySummary Duplicates ===\n')
    
    // Get the original memory from Supabase
    const { data: memory, error } = await supabase
      .from('memories')
      .select('*')
      .eq('id', memoryId)
      .single()
    
    if (memory) {
      console.log('Original Memory:')
      console.log('---------------')
      console.log(`ID: ${memory.id}`)
      console.log(`Created: ${new Date(memory.created_at).toLocaleString()}`)
      console.log(`Workspace: ${memory.workspace_id}`)
      console.log(`User: ${memory.user_id}`)
      console.log(`Role: ${memory.role}`)
      console.log(`Has Embedding: ${!!memory.embedding}`)
      console.log(`\nContent:\n${memory.content}`)
      console.log('\n' + '='.repeat(80) + '\n')
    }
    
    // Get all the EntitySummary duplicates
    const dupResult = await session.run(`
      MATCH (es:EntitySummary {entity_id: $memoryId})
      RETURN es
      ORDER BY es.created_at
    `, { memoryId })
    
    console.log(`Found ${dupResult.records.length} EntitySummary nodes for this memory:\n`)
    
    dupResult.records.forEach((record, idx) => {
      const node = record.get('es')
      const props = node.properties
      
      console.log(`\nDuplicate ${idx + 1}:`)
      console.log(`  ID: ${props.id}`)
      console.log(`  Created: ${new Date(props.created_at).toISOString()}`)
      console.log(`  Has Embedding: ${!!props.embedding}`)
      console.log(`  Pattern Signals: ${JSON.stringify(props.pattern_signals)}`)
      console.log(`  Keyword Frequencies: ${JSON.stringify(props.keyword_frequencies)}`)
    })
    
    // Check when pattern detection ran
    console.log('\n\n=== Pattern Detection Activity ===')
    const { data: logs } = await supabase
      .from('pattern_processor_logs')
      .select('*')
      .or(`message.ilike.%${memoryId}%,additional_data.ilike.%${memoryId}%`)
      .order('timestamp', { ascending: false })
      .limit(20)
    
    if (logs && logs.length > 0) {
      console.log(`\nFound ${logs.length} related pattern processor logs:`)
      logs.forEach(log => {
        const time = new Date(log.timestamp).toLocaleTimeString()
        console.log(`[${time}] ${log.message}`)
      })
    } else {
      console.log('\nNo pattern processor logs found for this memory')
    }
    
    // Check for pattern detection around the creation time
    const creationTime = new Date(dupResult.records[0].get('es').properties.created_at)
    const startTime = new Date(creationTime.getTime() - 60000) // 1 minute before
    const endTime = new Date(creationTime.getTime() + 60000) // 1 minute after
    
    console.log(`\n\n=== Pattern Detection Workers Around ${creationTime.toLocaleTimeString()} ===`)
    const { data: workerLogs } = await supabase
      .from('function_logs')
      .select('*')
      .gte('timestamp', startTime.toISOString())
      .lte('timestamp', endTime.toISOString())
      .or('event_message.ilike.%pattern detection worker started%,event_message.ilike.%Pattern detection coordinator%')
      .order('timestamp', { ascending: true })
    
    if (workerLogs && workerLogs.length > 0) {
      console.log(`\nWorker activity:`)
      workerLogs.forEach(log => {
        const time = new Date(log.timestamp).toLocaleTimeString()
        console.log(`[${time}] ${log.function_name}: ${log.event_message}`)
      })
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

main().catch(console.error)