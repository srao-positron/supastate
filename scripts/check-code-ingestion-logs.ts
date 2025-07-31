#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zqlfxakbkwssxfynrmnk.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxbGZ4YWtia3dzc3hmeW5ybW5rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzEyNDMxMiwiZXhwIjoyMDY4NzAwMzEyfQ.Dvvga6Y4vu7xtorjzgQ3B4kjoJYvISQcnOEAIuoFSOU'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  console.log('=== Checking Code Ingestion Logs ===\n')
  
  // 1. Check code-ingestion-worker logs
  console.log('1. Code Ingestion Worker Logs:')
  const { data: workerLogs } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .or('batch_id.eq.code-ingestion-worker,message.like.%code entity%,message.like.%Code entity%')
    .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(20)
  
  if (workerLogs && workerLogs.length > 0) {
    for (const log of workerLogs) {
      const time = new Date(log.created_at).toLocaleTimeString()
      console.log(`  [${time}] [${log.level}] ${log.message}`)
      
      if (log.metadata) {
        if (log.metadata.code_entity_id) console.log(`    Entity ID: ${log.metadata.code_entity_id}`)
        if (log.metadata.workspace_id) console.log(`    Workspace: ${log.metadata.workspace_id}`)
        if (log.metadata.error) console.log(`    Error: ${log.metadata.error}`)
      }
      
      if (log.error_stack && log.level === 'error') {
        console.log(`    Stack: ${log.error_stack.split('\n')[0]}`)
      }
    }
  } else {
    console.log('  No worker logs found')
  }
  
  // 2. Check ingest-code-to-neo4j function logs
  console.log('\n2. Ingest-Code-to-Neo4j Function Logs:')
  const { data: ingestLogs } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .or('batch_id.eq.ingest-code-to-neo4j,message.like.%Neo4j code ingestion%,message.like.%CodeEntity%')
    .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(20)
  
  if (ingestLogs && ingestLogs.length > 0) {
    for (const log of ingestLogs) {
      const time = new Date(log.created_at).toLocaleTimeString()
      console.log(`  [${time}] [${log.level}] ${log.message}`)
      
      if (log.error_stack) {
        console.log(`    Error: ${log.error_stack.split('\n')[0]}`)
      }
    }
  } else {
    console.log('  No ingest function logs found')
  }
  
  // 3. Check for Neo4j-related errors
  console.log('\n3. Neo4j Related Errors:')
  const { data: neo4jErrors } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .eq('level', 'error')
    .or('message.like.%Neo4j%,message.like.%neo4j%,error_stack.like.%neo4j%')
    .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(10)
  
  if (neo4jErrors && neo4jErrors.length > 0) {
    for (const log of neo4jErrors) {
      const time = new Date(log.created_at).toLocaleTimeString()
      console.log(`  [${time}] ${log.message}`)
      if (log.error_stack) {
        console.log(`    ${log.error_stack.split('\n').slice(0, 2).join('\n    ')}`)
      }
    }
  } else {
    console.log('  No Neo4j errors found')
  }
  
  // 4. Check pattern detection for code
  console.log('\n4. Code-Related Pattern Detection:')
  const { data: patternLogs } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .or('message.like.%code entities%,message.like.%CodeEntity%,message.like.%Processing % code%')
    .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(10)
  
  if (patternLogs && patternLogs.length > 0) {
    for (const log of patternLogs) {
      const time = new Date(log.created_at).toLocaleTimeString()
      console.log(`  [${time}] ${log.message}`)
    }
  }
  
  // 5. Summary stats
  console.log('\n5. Summary Stats:')
  const { data: errorStats } = await supabase
    .from('pattern_processor_logs')
    .select('message')
    .eq('level', 'error')
    .like('message', '%Code entity not found%')
    .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
  
  console.log(`  "Code entity not found" errors: ${errorStats?.length || 0}`)
  
  const { data: successStats } = await supabase
    .from('pattern_processor_logs')
    .select('message')
    .like('message', '%Code entity processed successfully%')
    .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
  
  console.log(`  Successfully processed: ${successStats?.length || 0}`)
}

main().catch(console.error)