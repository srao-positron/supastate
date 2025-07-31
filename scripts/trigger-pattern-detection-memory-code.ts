#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zqlfxakbkwssxfynrmnk.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxbGZ4YWtia3dzc3hmeW5ybW5rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzEyNDMxMiwiZXhwIjoyMDY4NzAwMzEyfQ.Dvvga6Y4vu7xtorjzgQ3B4kjoJYvISQcnOEAIuoFSOU'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  console.log('=== Triggering Memory-Code Pattern Detection ===\n')
  
  // Get a sample user to test with (personal data)
  const { data: userData } = await supabase
    .from('code_entities')
    .select('user_id')
    .not('user_id', 'is', null)
    .limit(1)
    .single()
  
  if (!userData?.user_id) {
    console.error('No user found with code entities')
    return
  }
  
  console.log(`Testing with user: ${userData.user_id}`)
  
  // Queue pattern detection for memory-code relationships only
  const { data: msgId, error } = await supabase.rpc('queue_pattern_detection_job', {
    p_batch_id: crypto.randomUUID(),
    p_pattern_types: ['memory_code'], // Only test memory-code
    p_limit: 100,
    p_workspace_id: `user:${userData.user_id}` // Personal data uses user: prefix
  })
  
  if (error) {
    console.error('Failed to queue pattern detection:', error)
    return
  }
  
  console.log(`✅ Pattern detection queued with message ID: ${msgId}`)
  console.log('\nWait a few seconds then check logs and relationships...')
  
  // Wait 5 seconds
  await new Promise(resolve => setTimeout(resolve, 5000))
  
  // Check recent logs
  const { data: logs } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .like('message', '%memory-code%')
    .order('created_at', { ascending: false })
    .limit(10)
  
  console.log('\n=== Recent Memory-Code Logs ===')
  if (logs && logs.length > 0) {
    for (const log of logs) {
      console.log(`[${log.level}] ${log.message}`)
      if (log.metadata?.relationshipCount !== undefined) {
        console.log(`  Relationships created: ${log.metadata.relationshipCount}`)
      }
    }
  } else {
    console.log('No recent memory-code logs found')
  }
}

main().catch(console.error)