#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

async function checkQueues() {
  console.log('=== Checking PGMQ Queues ===\n')
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  // Check what queues exist
  const { data, error } = await supabase
    .rpc('pgmq_list_queues')
    
  if (error) {
    console.error('Error listing queues:', error)
    return
  }
  
  console.log('Existing queues:')
  for (const queue of data || []) {
    console.log(`- ${queue.queue_name}`)
  }
}

checkQueues().catch(console.error)