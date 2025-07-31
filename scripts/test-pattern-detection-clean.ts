#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zqlfxakbkwssxfynrmnk.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxbGZ4YWtia3dzc3hmeW5ybW5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMxMjQzMTIsImV4cCI6MjA2ODcwMDMxMn0.LdZBLJlWCiOSpM5yX2j5TsgYiTR4dKoFMdE3Fulmlxk'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function testPatternDetection() {
  console.log('=== Testing Pattern Detection ===\n')
  
  const userId = 'a02c3fed-3a24-442f-becc-97bac8b75e90'
  const workspaceId = 'user:a02c3fed-3a24-442f-becc-97bac8b75e90'
  
  // Test different pattern types
  const testCases = [
    {
      name: 'Memory-Code Relationships',
      patternTypes: ['memory_code'],
      description: 'Should create relationships between memories and code'
    },
    {
      name: 'Debugging Patterns',
      patternTypes: ['debugging'],
      description: 'Should find debugging patterns in memories'
    },
    {
      name: 'Learning Patterns',
      patternTypes: ['learning'],
      description: 'Should find learning/research patterns'
    },
    {
      name: 'All Default Patterns',
      patternTypes: ['debugging', 'learning', 'memory_code'],
      description: 'Should run all default lightweight patterns'
    }
  ]
  
  for (const testCase of testCases) {
    console.log(`\n${testCase.name}:`)
    console.log(`  ${testCase.description}`)
    
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
          pattern_types: testCase.patternTypes
        })
      })
      
      const result = await response.json()
      console.log(`  Response:`, result)
      
      if (result.batchId) {
        // Wait a moment for processing
        await new Promise(resolve => setTimeout(resolve, 3000))
        
        // Check logs
        const { data: logs } = await supabase
          .from('pattern_processor_logs')
          .select('*')
          .eq('batch_id', result.batchId)
          .order('created_at', { ascending: false })
          .limit(10)
        
        console.log(`\n  Logs for batch ${result.batchId}:`)
        if (logs && logs.length > 0) {
          for (const log of logs) {
            console.log(`    [${log.level}] ${log.message}`)
            if (log.metadata?.relationshipCount !== undefined) {
              console.log(`      Relationships created: ${log.metadata.relationshipCount}`)
            }
            if (log.metadata?.patternCount !== undefined) {
              console.log(`      Patterns found: ${log.metadata.patternCount}`)
            }
          }
        } else {
          console.log('    No logs found yet')
        }
      }
      
    } catch (error) {
      console.error(`  Error:`, error.message)
    }
  }
}

testPatternDetection().catch(console.error)