#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zqlfxakbkwssxfynrmnk.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxbGZ4YWtia3dzc3hmeW5ybW5rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzEyNDMxMiwiZXhwIjoyMDY4NzAwMzEyfQ.Dvvga6Y4vu7xtorjzgQ3B4kjoJYvISQcnOEAIuoFSOU'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  const batchId = '36330b01-c19b-4ea7-9a27-3a763b1cbf2e' // Recent code batch
  
  console.log(`=== Tracing Code Ingestion Batch ${batchId} ===\n`)
  
  // Get all logs for this batch
  const { data: logs, error } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .eq('batch_id', batchId)
    .order('created_at', { ascending: true })
  
  if (error) {
    console.error('Error:', error)
    return
  }
  
  console.log(`Found ${logs?.length || 0} logs\n`)
  
  // Show the flow
  let lastFunction = ''
  for (const log of logs || []) {
    const time = new Date(log.created_at).toLocaleTimeString()
    const func = log.metadata?.functionName || log.metadata?.function || 'unknown'
    
    // Show function changes
    if (func !== lastFunction) {
      console.log(`\n=== Function: ${func} ===`)
      lastFunction = func
    }
    
    console.log(`[${time}] ${log.level}: ${log.message}`)
    
    // Show relevant metadata
    if (log.metadata) {
      if (log.metadata.code_entity_id) {
        console.log(`  Entity ID: ${log.metadata.code_entity_id}`)
      }
      if (log.metadata.neo4j_node_id) {
        console.log(`  Neo4j Node: ${log.metadata.neo4j_node_id}`)
      }
      if (log.metadata.error) {
        console.log(`  Error: ${log.metadata.error}`)
      }
    }
    
    // Show errors in detail
    if (log.level === 'error' && log.error_stack) {
      console.log('  Stack trace:')
      console.log(log.error_stack.split('\n').slice(0, 3).map(line => '    ' + line).join('\n'))
    }
  }
  
  // Look for specific patterns
  console.log('\n\n=== Analysis ===')
  
  const hasNeo4jCalls = logs?.some(log => 
    log.message.includes('Neo4j') || 
    log.message.includes('neo4j') ||
    log.metadata?.neo4j_node_id
  )
  console.log(`Contains Neo4j operations: ${hasNeo4jCalls ? 'YES' : 'NO'}`)
  
  const hasErrors = logs?.some(log => log.level === 'error')
  console.log(`Contains errors: ${hasErrors ? 'YES' : 'NO'}`)
  
  const processedCount = logs?.filter(log => 
    log.message.includes('processed successfully')
  ).length || 0
  console.log(`Successfully processed: ${processedCount} entities`)
  
  // Check if this is from coordinator or worker
  const isCoordinator = logs?.some(log => 
    log.message.includes('coordinator') || 
    log.metadata?.functionName?.includes('coordinator')
  )
  const isWorker = logs?.some(log => 
    log.message.includes('worker') || 
    log.metadata?.functionName?.includes('worker')
  )
  
  console.log(`\nBatch type: ${isCoordinator ? 'Coordinator' : isWorker ? 'Worker' : 'Unknown'}`)
}

main().catch(console.error)