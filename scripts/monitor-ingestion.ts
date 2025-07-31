#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

async function monitorIngestion() {
  console.log('=== MONITORING INGESTION SYSTEM ===\n')
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  const driver = neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
  )
  
  let iteration = 0
  
  // Monitor every 2 seconds
  const interval = setInterval(async () => {
    iteration++
    console.log(`\n========== Check #${iteration} at ${new Date().toLocaleTimeString()} ==========`)
    
    try {
      // 1. Check Queues
      console.log('\n📬 QUEUE STATUS:')
      const queues = ['memory_ingestion', 'pattern_detection', 'code_ingestion']
      
      for (const queue of queues) {
        const { data: msgs } = await supabase.rpc('pgmq_read', {
          queue_name: queue,
          vt: 0,
          qty: 100
        })
        console.log(`  ${queue}: ${msgs?.length || 0} messages`)
      }
      
      // 2. Check Tables
      console.log('\n📊 TABLE STATUS:')
      
      const { count: memCount } = await supabase
        .from('memories')
        .select('*', { count: 'exact', head: true })
      console.log(`  memories: ${memCount || 0}`)
      
      const { count: codeFileCount } = await supabase
        .from('code_files')
        .select('*', { count: 'exact', head: true })
      console.log(`  code_files: ${codeFileCount || 0}`)
      
      const { count: codeQueueCount } = await supabase
        .from('code_queue')
        .select('*', { count: 'exact', head: true })
      console.log(`  code_queue: ${codeQueueCount || 0}`)
      
      const { count: patternLogCount } = await supabase
        .from('pattern_processor_logs')
        .select('*', { count: 'exact', head: true })
      console.log(`  pattern_processor_logs: ${patternLogCount || 0}`)
      
      // 3. Check Neo4j
      console.log('\n🔮 NEO4J STATUS:')
      const session = driver.session()
      try {
        const result = await session.run(`
          MATCH (n)
          UNWIND labels(n) as label
          RETURN label, count(n) as count
          ORDER BY count DESC
        `)
        
        if (result.records.length === 0) {
          console.log('  No nodes yet')
        } else {
          for (const record of result.records) {
            console.log(`  ${record.get('label')}: ${record.get('count').toInt()}`)
          }
        }
      } finally {
        await session.close()
      }
      
      // 4. Check recent memories
      const { data: recentMemories } = await supabase
        .from('memories')
        .select('chunk_id, created_at, content')
        .order('created_at', { ascending: false })
        .limit(3)
        
      if (recentMemories && recentMemories.length > 0) {
        console.log('\n📝 RECENT MEMORIES:')
        for (const mem of recentMemories) {
          const preview = mem.content.substring(0, 50).replace(/\n/g, ' ')
          console.log(`  [${new Date(mem.created_at).toLocaleTimeString()}] ${preview}...`)
        }
      }
      
      // 5. Check recent pattern logs
      const { data: recentLogs } = await supabase
        .from('pattern_processor_logs')
        .select('level, message, created_at')
        .order('created_at', { ascending: false })
        .limit(3)
        
      if (recentLogs && recentLogs.length > 0) {
        console.log('\n🔍 RECENT PATTERN LOGS:')
        for (const log of recentLogs) {
          console.log(`  [${log.level}] ${log.message}`)
        }
      }
      
    } catch (error) {
      console.error('Monitor error:', error)
    }
  }, 2000)
  
  // Stop monitoring after 60 seconds or on Ctrl+C
  setTimeout(() => {
    clearInterval(interval)
    driver.close()
    console.log('\n\nMonitoring stopped after 60 seconds')
    process.exit(0)
  }, 60000)
  
  process.on('SIGINT', () => {
    clearInterval(interval)
    driver.close()
    console.log('\n\nMonitoring stopped by user')
    process.exit(0)
  })
}

monitorIngestion().catch(console.error)