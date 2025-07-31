#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkWorkerErrors() {
  console.log('=== Checking Worker Errors ===\n')
  
  // Check for any logs in the last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  
  const { data: allLogs, error: logError } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .gte('created_at', oneHourAgo)
    .order('created_at', { ascending: false })
    .limit(50)
    
  if (logError) {
    console.error('Error fetching logs:', logError)
    return
  }
  
  if (!allLogs || allLogs.length === 0) {
    console.log('No logs found in the last hour')
    
    // Check if table has any logs at all
    const { count } = await supabase
      .from('pattern_processor_logs')
      .select('*', { count: 'exact', head: true })
      
    console.log(`\nTotal logs in table: ${count || 0}`)
    
    if (count && count > 0) {
      // Get the most recent log
      const { data: recent } = await supabase
        .from('pattern_processor_logs')
        .select('created_at, message')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
        
      if (recent) {
        console.log(`Most recent log: ${recent.message}`)
        console.log(`Created at: ${new Date(recent.created_at).toLocaleString()}`)
      }
    }
  } else {
    console.log(`Found ${allLogs.length} logs in the last hour:\n`)
    
    // Group by level
    const byLevel = allLogs.reduce((acc, log) => {
      acc[log.level] = (acc[log.level] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    
    console.log('Log levels:')
    for (const [level, count] of Object.entries(byLevel)) {
      console.log(`- ${level}: ${count}`)
    }
    
    // Show errors and warnings
    const errors = allLogs.filter(log => log.level === 'error' || log.level === 'warning')
    if (errors.length > 0) {
      console.log('\n=== Errors and Warnings ===')
      for (const log of errors.slice(0, 10)) {
        const time = new Date(log.created_at).toLocaleTimeString()
        console.log(`\n[${time}] [${log.level}] ${log.message}`)
        if (log.details) {
          console.log('Details:', JSON.stringify(log.details, null, 2))
        }
        if (log.error_stack) {
          console.log('Stack:', log.error_stack.split('\n').slice(0, 3).join('\n'))
        }
      }
    }
    
    // Show recent worker starts
    const workerStarts = allLogs.filter(log => 
      log.message.includes('worker started') || 
      log.message.includes('Worker started')
    )
    
    if (workerStarts.length > 0) {
      console.log('\n=== Recent Worker Starts ===')
      for (const log of workerStarts.slice(0, 5)) {
        const time = new Date(log.created_at).toLocaleTimeString()
        console.log(`[${time}] ${log.message}`)
      }
    }
  }
  
  // Check edge function invocations
  console.log('\n=== Checking Edge Function Health ===')
  const edgeFunctions = [
    'memory-ingestion-worker',
    'pattern-detection-worker',
    'code-ingestion-worker'
  ]
  
  console.log('\nTo manually test workers, run:')
  for (const func of edgeFunctions) {
    console.log(`curl -X POST https://zqlfxakbkwssxfynrmnk.supabase.co/functions/v1/${func} \\`)
    console.log(`  -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY" \\`)
    console.log(`  -H "Content-Type: application/json" -d '{}'\n`)
  }
}

checkWorkerErrors().catch(console.error)