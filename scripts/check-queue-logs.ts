#!/usr/bin/env npx tsx

/**
 * Check pattern processor and ingestion logs from the database
 * This helps debug the queue-based processing flow
 */

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface LogOptions {
  batchId?: string
  minutes?: number
  level?: string
  search?: string
  worker?: string
}

async function checkLogs(options: LogOptions = {}) {
  console.log('\n=== Checking Queue Processing Logs ===\n')
  
  let query = supabase
    .from('pattern_processor_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)
  
  if (options.batchId) {
    query = query.eq('batch_id', options.batchId)
  }
  
  if (options.level) {
    query = query.eq('level', options.level)
  }
  
  if (options.minutes) {
    const since = new Date(Date.now() - options.minutes * 60 * 1000).toISOString()
    query = query.gte('created_at', since)
  }
  
  if (options.search) {
    query = query.or(`message.ilike.%${options.search}%,details::text.ilike.%${options.search}%`)
  }
  
  const { data: logs, error } = await query
  
  if (error) {
    console.error('Error fetching logs:', error)
    return
  }
  
  if (!logs || logs.length === 0) {
    console.log('No logs found with the given criteria')
    return
  }
  
  // Group logs by batch for better readability
  const batches = new Map<string, any[]>()
  
  for (const log of logs) {
    const batchId = log.batch_id || 'no-batch'
    if (!batches.has(batchId)) {
      batches.set(batchId, [])
    }
    batches.get(batchId)!.push(log)
  }
  
  // Display logs grouped by batch
  for (const [batchId, batchLogs] of batches) {
    console.log(`\n📦 Batch: ${batchId}`)
    console.log(`   Started: ${new Date(batchLogs[batchLogs.length - 1].created_at).toLocaleString()}`)
    console.log(`   Logs: ${batchLogs.length}\n`)
    
    for (const log of batchLogs.reverse()) {
      const time = new Date(log.created_at).toLocaleTimeString()
      const level = log.level.toUpperCase().padEnd(5)
      const levelEmoji = {
        'info': '💡',
        'warn': '⚠️',
        'error': '❌',
        'debug': '🔍'
      }[log.level] || '📝'
      
      console.log(`[${time}] ${levelEmoji} ${level} ${log.message}`)
      
      if (log.details && Object.keys(log.details).length > 0) {
        const details = { ...log.details }
        // Remove large arrays from details for cleaner output
        if (details.workspaces && Array.isArray(details.workspaces)) {
          details.workspaces = `[${details.workspaces.length} workspaces]`
        }
        if (details.sampleEntityIds && Array.isArray(details.sampleEntityIds)) {
          details.sampleEntityIds = `[${details.sampleEntityIds.length} entities]`
        }
        console.log(`         📊 ${JSON.stringify(details)}`)
      }
      
      if (log.error_stack) {
        console.log(`         🔥 ${log.error_stack.split('\n')[0]}`)
      }
    }
  }
  
  // Show summary
  console.log('\n=== Summary ===')
  const summary = logs.reduce((acc, log) => {
    acc[log.level] = (acc[log.level] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  
  Object.entries(summary).forEach(([level, count]) => {
    console.log(`${level}: ${count}`)
  })
  
  // Check queue health
  console.log('\n=== Queue Health ===')
  const { data: queueHealth, error: queueError } = await supabase
    .from('queue_health')
    .select('*')
  
  if (queueHealth && !queueError) {
    for (const queue of queueHealth) {
      console.log(`\n📬 ${queue.queue_name}:`)
      console.log(`   Length: ${queue.queue_length}`)
      console.log(`   Oldest message: ${queue.oldest_msg_age_sec}s ago`)
      console.log(`   Total processed: ${queue.total_messages}`)
    }
  }
  
  // Show recent patterns detected
  if (options.worker !== 'ingestion-only') {
    console.log('\n=== Recent Pattern Detection ===')
    const patternLogs = logs.filter(log => 
      log.message.includes('pattern') && 
      (log.message.includes('Found') || log.message.includes('stored'))
    )
    
    if (patternLogs.length > 0) {
      for (const log of patternLogs.slice(0, 10)) {
        console.log(`[${new Date(log.created_at).toLocaleTimeString()}] ${log.message}`)
        if (log.details?.patternCount) {
          console.log(`   Patterns: ${log.details.patternCount}`)
        }
      }
    } else {
      console.log('No pattern detection activity found')
    }
  }
}

// Parse command line arguments
const args = process.argv.slice(2)
const options: LogOptions = {
  minutes: 10 // Default to last 10 minutes
}

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--batch':
      options.batchId = args[++i]
      break
    case '--minutes':
      options.minutes = parseInt(args[++i])
      break
    case '--level':
      options.level = args[++i]
      break
    case '--search':
      options.search = args[++i]
      break
    case '--errors':
      options.level = 'error'
      break
    case '--worker':
      options.worker = args[++i]
      break
    case '--help':
      console.log(`
Usage: npx tsx scripts/check-queue-logs.ts [options]

Options:
  --batch <id>      Filter by batch ID
  --minutes <n>     Show logs from last n minutes (default: 10)
  --level <level>   Filter by log level (info, warn, error, debug)
  --search <text>   Search in message and details
  --errors          Show only errors
  --worker <type>   Filter by worker type
  --help            Show this help

Examples:
  npx tsx scripts/check-queue-logs.ts --errors
  npx tsx scripts/check-queue-logs.ts --search "pattern detection"
  npx tsx scripts/check-queue-logs.ts --minutes 30 --level error
      `)
      process.exit(0)
  }
}

checkLogs(options).catch(console.error)