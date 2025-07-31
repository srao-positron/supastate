import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

// Load environment variables
config({ path: '.env.local' })

async function checkNeo4jIngestionLogs() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  console.log('=== CHECKING NEO4J INGESTION LOGS ===\n')

  // Search for the specific ID in logs
  const targetId = 'c58846a3-da47-42e1-a206-cd2a9cdd5b44'
  
  // Check pattern processor logs
  const { data: logs } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .or(`message.ilike.%${targetId}%,details::text.ilike.%${targetId}%`)
    .order('created_at', { ascending: false })
    .limit(20)

  if (logs && logs.length > 0) {
    console.log(`Found ${logs.length} logs containing the mystery ID ${targetId}:`)
    logs.forEach(log => {
      console.log(`\n${log.created_at}: ${log.message}`)
      if (log.details) {
        console.log('Details:', JSON.stringify(log.details, null, 2))
      }
    })
  } else {
    console.log(`No logs found containing ID ${targetId}`)
  }

  // Check for CodeEntity creation logs
  console.log('\n\n=== RECENT CODE ENTITY CREATION LOGS ===')
  const { data: creationLogs } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .ilike('message', '%Created CodeEntity node%')
    .order('created_at', { ascending: false })
    .limit(10)

  if (creationLogs) {
    console.log(`\nFound ${creationLogs.length} CodeEntity creation logs:`)
    creationLogs.forEach(log => {
      console.log(`\n${log.created_at}: ${log.message}`)
    })
  }

  // Look for any logs from ingest-code-to-neo4j
  console.log('\n\n=== INGEST-CODE-TO-NEO4J FUNCTION LOGS ===')
  const { data: ingestLogs } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .ilike('message', '%Ingest Code to Neo4j%')
    .order('created_at', { ascending: false })
    .limit(20)

  if (ingestLogs) {
    console.log(`\nFound ${ingestLogs.length} ingestion logs`)
    
    // Count unique processing messages
    const processingMessages = ingestLogs.filter(log => 
      log.message.includes('Processing') && log.message.includes('code entities')
    )
    
    if (processingMessages.length > 0) {
      console.log('\nProcessing messages:')
      processingMessages.forEach(log => {
        const match = log.message.match(/Processing (\d+) code entities/)
        if (match) {
          console.log(`- ${log.created_at}: Processing ${match[1]} entities`)
        }
      })
    }
  }
}

checkNeo4jIngestionLogs().catch(console.error)