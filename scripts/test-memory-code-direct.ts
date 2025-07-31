#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zqlfxakbkwssxfynrmnk.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxbGZ4YWtia3dzc3hmeW5ybW5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMxMjQzMTIsImV4cCI6MjA2ODcwMDMxMn0.LdZBLJlWCiOSpM5yX2j5TsgYiTR4dKoFMdE3Fulmlxk'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function testMemoryCodeDetection() {
  console.log('=== Testing Memory-Code Detection Directly ===\n')
  
  const userId = 'a02c3fed-3a24-442f-becc-97bac8b75e90'
  const workspaceId = 'user:a02c3fed-3a24-442f-becc-97bac8b75e90'
  
  // Trigger pattern detection for memory-code only
  console.log('Triggering memory-code pattern detection...')
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/pattern-processor`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({
        workspace_id: workspaceId,
        user_id: userId,
        pattern_types: ['memory_code']
      })
    })
    
    const result = await response.json()
    console.log('Response:', result)
    
    if (result.batchId) {
      console.log(`\nWaiting for processing (batch ${result.batchId})...`)
      
      // Wait longer for processing
      await new Promise(resolve => setTimeout(resolve, 5000))
      
      // Check detailed logs
      const { data: logs } = await supabase
        .from('pattern_processor_logs')
        .select('*')
        .eq('batch_id', result.batchId)
        .order('created_at', { ascending: true })
      
      console.log(`\nDetailed logs (${logs?.length || 0} entries):`)
      if (logs && logs.length > 0) {
        for (const log of logs) {
          const time = new Date(log.created_at).toLocaleTimeString()
          console.log(`\n[${time}] [${log.level}] ${log.message}`)
          
          if (log.metadata) {
            const meta = log.metadata
            if (meta.functionName) console.log(`  Function: ${meta.functionName}`)
            if (meta.workspaceId) console.log(`  Workspace: ${meta.workspaceId}`)
            if (meta.userId) console.log(`  User: ${meta.userId}`)
            if (meta.tenantFilter) console.log(`  Tenant filter: ${meta.tenantFilter}`)
            if (meta.memoryCount !== undefined) console.log(`  Memory count: ${meta.memoryCount}`)
            if (meta.relationshipCount !== undefined) console.log(`  Relationships: ${meta.relationshipCount}`)
            if (meta.sampleMemory) {
              console.log(`  Sample memory:`, JSON.stringify(meta.sampleMemory, null, 2))
            }
          }
          
          if (log.error_stack) {
            console.log('  Error stack:')
            console.log(log.error_stack.split('\n').slice(0, 5).join('\n'))
          }
        }
      }
      
      // Also check if any patterns were created
      const { data: patterns } = await supabase
        .from('pattern_processor_logs')
        .select('*')
        .eq('batch_id', result.batchId)
        .like('message', '%pattern%')
        .order('created_at', { ascending: false })
        .limit(10)
      
      if (patterns && patterns.length > 0) {
        console.log('\n\nPattern-related logs:')
        for (const log of patterns) {
          console.log(`  ${log.message}`)
        }
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message)
  }
}

testMemoryCodeDetection().catch(console.error)