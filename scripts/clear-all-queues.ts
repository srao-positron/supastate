#!/usr/bin/env npx tsx

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceRole) {
  console.error('Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceRole, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function clearAllQueues() {
  console.log('🧹 Clearing all PGMQ queues...\n')

  // List of queues to purge
  const queues = ['memory_ingestion', 'code_ingestion', 'pattern_detection']

  // Purge each queue
  for (const queueName of queues) {
    console.log(`Purging queue: ${queueName}`)
    
    const { data, error } = await supabase.rpc('purge_queue', {
      queue_name: queueName
    })

    if (error) {
      console.error(`❌ Error purging ${queueName}:`, error)
    } else {
      console.log(`✅ Successfully purged ${queueName}`)
    }
  }

  console.log('\n📊 Checking queue depths after purging...\n')

  // Check queue depths after purging
  const { data: queueDepths, error: depthError } = await supabase
    .rpc('get_queue_metrics')

  if (depthError) {
    console.error('❌ Error checking queue depths:', depthError)
  } else if (queueDepths) {
    console.log('Queue depths after purging:')
    console.table(queueDepths)
  }

  // Alternative: Direct SQL query if RPC functions don't exist
  console.log('\n📊 Alternative check using direct SQL...\n')
  
  const { data: directCheck, error: directError } = await supabase.rpc('sql', {
    query: `
      SELECT 
          'memory_ingestion' as queue_name,
          COUNT(*) as message_count
      FROM pgmq.memory_ingestion
      UNION ALL
      SELECT 
          'code_ingestion' as queue_name,
          COUNT(*) as message_count
      FROM pgmq.code_ingestion
      UNION ALL
      SELECT 
          'pattern_detection' as queue_name,
          COUNT(*) as message_count
      FROM pgmq.pattern_detection;
    `
  })

  if (!directError && directCheck) {
    console.log('Direct SQL check results:')
    console.table(directCheck)
  }

  console.log('\n✨ Queue clearing complete!')
}

// Run the function
clearAllQueues().catch(console.error)