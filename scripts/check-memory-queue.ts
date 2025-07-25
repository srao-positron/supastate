#!/usr/bin/env npx tsx
import { config as dotenvConfig } from 'dotenv'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

// Load env vars
dotenvConfig({ path: resolve(process.cwd(), '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

async function checkMemoryQueue() {
  console.log('🔍 Checking memory_queue and memories tables...\n')

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  
  // Check memory_queue
  console.log('📋 MEMORY_QUEUE:')
  console.log('================')
  
  const { data: queue, count: queueCount } = await supabase
    .from('memory_queue')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(5)
  
  console.log(`Total items in queue: ${queueCount || 0}`)
  
  if (queue && queue.length > 0) {
    console.log('\nLatest queue items:')
    queue.forEach(item => {
      console.log(`- ID: ${item.id} | Status: ${item.status} | Created: ${new Date(item.created_at).toLocaleString()}`)
      console.log(`  Workspace: ${item.workspace_id} | Content length: ${item.content?.length || 0}`)
    })
    
    // Check status distribution
    const { data: statusCounts } = await supabase
      .from('memory_queue')
      .select('status')
    
    const statusMap = statusCounts?.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    
    console.log('\nStatus distribution:')
    Object.entries(statusMap || {}).forEach(([status, count]) => {
      console.log(`- ${status}: ${count}`)
    })
  }
  
  // Check memories table
  console.log('\n\n📋 MEMORIES TABLE:')
  console.log('==================')
  
  const { data: memories, count: memoryCount } = await supabase
    .from('memories')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(5)
  
  console.log(`Total memories: ${memoryCount || 0}`)
  
  if (memories && memories.length > 0) {
    console.log('\nLatest memories:')
    memories.forEach(memory => {
      console.log(`- ID: ${memory.id} | Project: ${memory.project_name} | Created: ${new Date(memory.created_at).toLocaleString()}`)
      console.log(`  Has embedding: ${!!memory.embedding} | Content length: ${memory.content?.length || 0}`)
    })
  }
  
  process.exit(0)
}

checkMemoryQueue().catch(console.error)