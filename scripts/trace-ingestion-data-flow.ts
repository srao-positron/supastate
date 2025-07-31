import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

// Load environment variables
config({ path: '.env.local' })

async function traceIngestionDataFlow() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  console.log('=== TRACING INGESTION DATA FLOW ===\n')
  
  console.log('1. CODE INGESTION FLOW:')
  console.log('   ingest-code (initial upload) -> code_entities table')
  console.log('   -> pgmq queue (code_ingestion)')
  console.log('   -> code-ingestion-worker')
  console.log('   -> ingest-code-to-neo4j')
  console.log('   -> Neo4j\n')
  
  console.log('2. DATA STRUCTURE AT EACH STEP:\n')
  
  // Check queue message structure
  const { data: queueMessages } = await supabase.rpc('pgmq_read', {
    queue_name: 'code_ingestion',
    vt: 0,
    qty: 1
  })
  
  if (queueMessages && queueMessages.length > 0) {
    console.log('Queue message structure:')
    console.log(JSON.stringify(queueMessages[0], null, 2))
  }
  
  console.log('\n3. ISSUE IDENTIFICATION:')
  console.log('Looking at code-ingestion-worker/index.ts line 122-132:')
  console.log('It fetches codeEntity from code_entities table')
  console.log('Then passes it as: code_entities: [codeEntity]\n')
  
  console.log('4. POTENTIAL BUG LOCATION:')
  console.log('The bug might be in how the array is being handled.')
  console.log('If the ingestion function is processing multiple entities')
  console.log('but they all reference the same object or ID.\n')
  
  // Check recent logs for pattern
  const { data: logs } = await supabase
    .from('pattern_processor_logs')
    .select('created_at, message, details')
    .ilike('message', '%Created CodeEntity node%')
    .order('created_at', { ascending: false })
    .limit(10)
  
  if (logs && logs.length > 0) {
    console.log('5. RECENT INGESTION LOGS:')
    const paths = new Set()
    logs.forEach(log => {
      const match = log.message.match(/Created CodeEntity node for (.+)$/)
      if (match) {
        paths.add(match[1])
      }
    })
    console.log(`Found ${paths.size} unique paths in recent logs`)
    if (paths.size > 0 && paths.size < 5) {
      console.log('Paths:', Array.from(paths))
    }
  }
  
  console.log('\n6. HYPOTHESIS:')
  console.log('The same ID is being used for all entities because:')
  console.log('- The ID might be generated once and reused')
  console.log('- There might be a closure issue in the async loop')
  console.log('- The entity object might be mutated during processing')
}

traceIngestionDataFlow().catch(console.error)