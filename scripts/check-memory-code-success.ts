#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zqlfxakbkwssxfynrmnk.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxbGZ4YWtia3dzc3hmeW5ybW5rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzEyNDMxMiwiZXhwIjoyMDY4NzAwMzEyfQ.Dvvga6Y4vu7xtorjzgQ3B4kjoJYvISQcnOEAIuoFSOU'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  console.log('=== Checking Memory-Code Relationship Status ===\n')
  
  // Get recent logs that mention relationship creation
  const { data: logs, error } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .or('message.like.%memory-code%,message.like.%Created%relationships%,message.like.%Total memory-code%')
    .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(20)
  
  if (error) {
    console.error('Error fetching logs:', error)
    return
  }
  
  console.log(`Found ${logs?.length || 0} recent logs\n`)
  
  if (logs && logs.length > 0) {
    for (const log of logs) {
      const time = new Date(log.created_at).toLocaleTimeString()
      console.log(`[${time}] [${log.level}] ${log.message}`)
      
      if (log.metadata?.relationshipCount !== undefined) {
        console.log(`  → Relationships: ${log.metadata.relationshipCount}`)
      }
      if (log.metadata?.totalRelationships !== undefined) {
        console.log(`  → Total created: ${log.metadata.totalRelationships}`)
      }
      if (log.error_stack) {
        console.log(`  → Error: ${log.error_stack.split('\n')[0]}`)
      }
      console.log()
    }
  }
  
  // Check for any pattern detection batches
  const { data: batches, error: batchError } = await supabase
    .from('pattern_processor_logs')
    .select('batch_id, created_at')
    .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
  
  if (batches && batches.length > 0) {
    const uniqueBatches = [...new Set(batches.map(b => b.batch_id))].slice(0, 5)
    console.log('\nRecent batch IDs:')
    for (const batchId of uniqueBatches) {
      console.log(`  - ${batchId}`)
    }
  }
}

main().catch(console.error)