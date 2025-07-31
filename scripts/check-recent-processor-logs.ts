import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zqlfxakbkwssxfynrmnk.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxbGZ4YWtia3dzc3hmeW5ybW5rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzEyNDMxMiwiZXhwIjoyMDY4NzAwMzEyfQ.Dvvga6Y4vu7xtorjzgQ3B4kjoJYvISQcnOEAIuoFSOU'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  // Check recent pattern processor logs
  const { data: logs, error: logError } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString()) // Last 10 minutes
    .order('created_at', { ascending: false })
    .limit(100)
  
  if (logError) {
    console.error('Error fetching logs:', logError)
    return
  }
  
  console.log(`Found ${logs?.length} logs in the last 10 minutes:\n`)
  
  // Show logs by type
  const codeProcessingLogs = logs?.filter(l => l.message.includes('code entities'))
  const memoryCodeLogs = logs?.filter(l => l.message.includes('memory-code'))
  const errorLogs = logs?.filter(l => l.level === 'error')
  
  if (codeProcessingLogs?.length > 0) {
    console.log('=== Code Processing ===')
    for (const log of codeProcessingLogs) {
      console.log(`[${new Date(log.created_at).toLocaleTimeString()}] ${log.message}`)
      if (log.metadata?.entityCount) {
        console.log(`  Entity count: ${log.metadata.entityCount}`)
      }
    }
  }
  
  if (memoryCodeLogs?.length > 0) {
    console.log('\n=== Memory-Code Relationships ===')
    for (const log of memoryCodeLogs) {
      console.log(`[${new Date(log.created_at).toLocaleTimeString()}] ${log.message}`)
      if (log.metadata?.relationshipCount) {
        console.log(`  Relationships: ${log.metadata.relationshipCount}`)
      }
    }
  }
  
  if (errorLogs?.length > 0) {
    console.log('\n=== Errors ===')
    for (const log of errorLogs.slice(0, 5)) {
      console.log(`[${new Date(log.created_at).toLocaleTimeString()}] ${log.message}`)
      if (log.metadata?.error) {
        console.log(`  ${log.metadata.error}`)
      }
    }
  }
  
  // Show summary
  const functionCounts = {}
  for (const log of logs || []) {
    const fn = log.metadata?.functionName || 'unknown'
    functionCounts[fn] = (functionCounts[fn] || 0) + 1
  }
  
  console.log('\n=== Summary by Function ===')
  for (const [fn, count] of Object.entries(functionCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${fn}: ${count} logs`)
  }
}

main().catch(console.error)