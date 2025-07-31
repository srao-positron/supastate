#!/usr/bin/env tsx
import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkMemoryCodeLogs() {
  console.log('🔍 Checking Memory-Code Relationship Detection Logs...\n')

  try {
    // Check pattern processor logs for memory-code detection
    const { data: logs } = await supabase
      .from('pattern_processor_logs')
      .select('*')
      .ilike('message', '%memory%code%')
      .order('created_at', { ascending: false })
      .limit(30)

    console.log('📊 Memory-Code Detection Logs:')
    console.log('─'.repeat(80))
    
    if (logs && logs.length > 0) {
      logs.forEach(log => {
        console.log(`[${new Date(log.created_at).toLocaleString()}] ${log.level}: ${log.message}`)
        if (log.metadata) {
          const meta = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata
          if (meta.relationshipCount !== undefined || meta.memoryCount !== undefined) {
            console.log(`  Metadata:`, meta)
          }
        }
      })
    } else {
      console.log('No memory-code detection logs found')
    }

    // Check for any logs mentioning relationships
    console.log('\n📊 Relationship Creation Logs:')
    console.log('─'.repeat(80))
    
    const { data: relLogs } = await supabase
      .from('pattern_processor_logs')
      .select('*')
      .or('message.ilike.%relationship%,message.ilike.%RELATES_TO%,message.ilike.%Created%memory%')
      .order('created_at', { ascending: false })
      .limit(20)
    
    if (relLogs && relLogs.length > 0) {
      relLogs.forEach(log => {
        console.log(`[${new Date(log.created_at).toLocaleString()}] ${log.level}: ${log.message}`)
      })
    } else {
      console.log('No relationship creation logs found')
    }

    // Check pattern types detected
    console.log('\n📊 Pattern Types Detected:')
    console.log('─'.repeat(80))
    
    const { data: patternLogs } = await supabase
      .from('pattern_processor_logs')
      .select('*')
      .ilike('message', '%pattern detection for types:%')
      .order('created_at', { ascending: false })
      .limit(10)
    
    if (patternLogs && patternLogs.length > 0) {
      patternLogs.forEach(log => {
        console.log(`[${new Date(log.created_at).toLocaleString()}] ${log.message}`)
      })
    }

  } catch (error) {
    console.error('❌ Error:', error)
  }
}

checkMemoryCodeLogs()