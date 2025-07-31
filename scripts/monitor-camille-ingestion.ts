#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

async function monitorIngestion() {
  console.log('=== Monitoring Camille Ingestion ===\n')
  console.log('Press Ctrl+C to stop monitoring\n')
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  let lastMemoryCount = 0
  let lastPatternCount = 0
  
  while (true) {
    console.clear()
    console.log('=== Camille Ingestion Monitor ===')
    console.log(new Date().toLocaleTimeString())
    console.log('================================\n')
    
    // Check memories
    const { count: memoryCount } = await supabase
      .from('memories')
      .select('*', { count: 'exact', head: true })
      
    // Check queues
    const { data: memoryQueue } = await supabase.rpc('pgmq_read', {
      queue_name: 'memory_ingestion',
      vt: 0,
      qty: 1
    })
    
    const { data: patternQueue } = await supabase.rpc('pgmq_read', {
      queue_name: 'pattern_detection',
      vt: 0,
      qty: 1
    })
    
    // Check recent logs
    const { data: logs } = await supabase
      .from('pattern_processor_logs')
      .select('created_at, level, message, function_name')
      .gte('created_at', new Date(Date.now() - 60000).toISOString())
      .order('created_at', { ascending: false })
      .limit(5)
    
    // Display stats
    console.log('📊 Statistics:')
    console.log(`  Memories in DB: ${memoryCount || 0} ${memoryCount > lastMemoryCount ? '⬆️' : ''}`)
    console.log(`  Memory queue: ${memoryQueue?.length || 0} messages`)
    console.log(`  Pattern queue: ${patternQueue?.length || 0} messages`)
    
    // Show recent activity
    if (logs && logs.length > 0) {
      console.log('\n📝 Recent Activity:')
      for (const log of logs) {
        const time = new Date(log.created_at).toLocaleTimeString()
        const func = log.function_name || 'unknown'
        console.log(`  [${time}] ${func}: ${log.message}`)
      }
    }
    
    lastMemoryCount = memoryCount || 0
    
    // Check patterns
    const { data: patterns } = await supabase
      .from('pattern_processor_logs')
      .select('message')
      .eq('message', 'Pattern detection batch complete')
      .gte('created_at', new Date(Date.now() - 300000).toISOString())
      
    if (patterns && patterns.length > lastPatternCount) {
      console.log('\n✅ Pattern detection completed!')
      lastPatternCount = patterns.length
    }
    
    console.log('\n💡 Tips:')
    console.log('  - Run "npx tsx scripts/trigger-workers.ts" to process queues')
    console.log('  - Run "npx tsx scripts/check-patterns.ts" to see patterns')
    
    // Wait 5 seconds before refreshing
    await new Promise(resolve => setTimeout(resolve, 5000))
  }
}

monitorIngestion().catch(console.error)