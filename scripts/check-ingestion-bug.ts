import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

// Load environment variables
config({ path: '.env.local' })

async function checkIngestionBug() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  console.log('=== CHECKING INGESTION LOGS ===\n')

  // Check pattern processor logs for code ingestion
  const { data: logs, error } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .or('message.ilike.%code ingestion%,message.ilike.%ingest-code-to-neo4j%,details->>code_entity_id.neq.null')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('Error fetching logs:', error)
    return
  }

  console.log(`Found ${logs?.length || 0} relevant logs\n`)

  // Look for patterns in the logs
  const entityIds = new Set<string>()
  const messageTypes = new Map<string, number>()

  logs?.forEach(log => {
    // Count message types
    const msgType = log.message
    messageTypes.set(msgType, (messageTypes.get(msgType) || 0) + 1)

    // Extract entity IDs
    if (log.details?.code_entity_id) {
      entityIds.add(log.details.code_entity_id)
    }
  })

  console.log('Message type distribution:')
  Array.from(messageTypes.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`)
    })

  console.log(`\nUnique entity IDs found in logs: ${entityIds.size}`)
  if (entityIds.size <= 5) {
    console.log('Entity IDs:', Array.from(entityIds))
  }

  // Look for the specific Neo4j ID
  const neo4jId = 'c58846a3-da47-42e1-a206-cd2a9cdd5b44'
  const logsWithNeo4jId = logs?.filter(log => 
    JSON.stringify(log).includes(neo4jId)
  )

  if (logsWithNeo4jId && logsWithNeo4jId.length > 0) {
    console.log(`\n⚠️  Found ${logsWithNeo4jId.length} logs containing the Neo4j ID ${neo4jId}`)
    console.log('This ID is being generated somewhere in the ingestion process!')
  }

  // Check recent code ingestion worker logs
  console.log('\n=== RECENT CODE INGESTION WORKER LOGS ===')
  const recentLogs = logs?.filter(log => 
    log.message.includes('Processing code entity') ||
    log.message.includes('Code entity processed')
  ).slice(0, 5)

  recentLogs?.forEach(log => {
    console.log(`\n${log.created_at}: ${log.message}`)
    if (log.details?.code_entity_id) {
      console.log(`  Entity ID: ${log.details.code_entity_id}`)
    }
    if (log.details?.workspace_id) {
      console.log(`  Workspace: ${log.details.workspace_id}`)
    }
  })
}

checkIngestionBug().catch(console.error)