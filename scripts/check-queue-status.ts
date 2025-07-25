#!/usr/bin/env npx tsx
import { config as dotenvConfig } from 'dotenv'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { executeQuery } from '../src/lib/neo4j/client'

// Load env vars
dotenvConfig({ path: resolve(process.cwd(), '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing required environment variables')
  process.exit(1)
}

async function checkQueueStatus() {
  console.log('📊 Checking Memory Processing Pipeline Status...\n')

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  
  // Check memory_queue status
  console.log('📦 MEMORY QUEUE STATUS:')
  console.log('======================')
  
  const { data: queueStats, error } = await supabase
    .from('memory_queue')
    .select('status')
    .order('created_at', { ascending: false })
    .limit(1000)
  
  if (error) {
    console.error('Error fetching queue stats:', error)
    return
  }
  
  // Count by status
  const statusCounts = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0
  }
  
  queueStats?.forEach(item => {
    statusCounts[item.status as keyof typeof statusCounts]++
  })
  
  console.log('Total items:', queueStats?.length || 0)
  console.log('  Pending:', statusCounts.pending)
  console.log('  Processing:', statusCounts.processing)
  console.log('  Completed:', statusCounts.completed)
  console.log('  Failed:', statusCounts.failed)
  
  // Show recent items
  const { data: recentItems } = await supabase
    .from('memory_queue')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5)
  
  if (recentItems && recentItems.length > 0) {
    console.log('\nMost recent items:')
    recentItems.forEach(item => {
      console.log(`  - ${item.chunk_id} | ${item.status} | ${item.created_at}`)
      if (item.error) {
        console.log(`    Error: ${item.error}`)
      }
    })
  }
  
  // Check Neo4j for memories
  console.log('\n\n🌐 NEO4J MEMORY STATUS:')
  console.log('======================')
  
  try {
    const result = await executeQuery(`
      MATCH (m:Memory)
      RETURN count(m) as totalMemories,
             max(m.created_at) as latestMemory
    `)
    
    const record = result.records[0]
    console.log('Total memories:', record?.totalMemories || 0)
    console.log('Latest memory:', record?.latestMemory || 'None')
    
    // Get project breakdown
    const projectResult = await executeQuery(`
      MATCH (m:Memory)
      RETURN m.project_name as project, count(m) as count
      ORDER BY count DESC
      LIMIT 10
    `)
    
    if (projectResult.records.length > 0) {
      console.log('\nMemories by project:')
      projectResult.records.forEach(record => {
        console.log(`  - ${record.project || 'default'}: ${record.count}`)
      })
    }
    
  } catch (error) {
    console.error('Error querying Neo4j:', error)
  }
  
  process.exit(0)
}

checkQueueStatus().catch(console.error)