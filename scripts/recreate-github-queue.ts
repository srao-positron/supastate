#!/usr/bin/env npx tsx

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function recreateQueue() {
  console.log('🔧 Attempting to recreate github_code_parsing queue...\n')
  
  try {
    // First check if pgmq has a drop function
    console.log('1️⃣ Checking for drop queue function...')
    const { data: dropResult, error: dropError } = await supabase.rpc('pgmq_drop_queue', {
      queue_name: 'github_code_parsing'
    })
    
    if (dropError) {
      console.log('Drop function not available:', dropError.message)
      
      // Try direct SQL to drop the queue
      console.log('\n2️⃣ Trying direct SQL drop...')
      const { error: sqlError } = await supabase.rpc('query_json', {
        query: `SELECT pgmq.drop_queue('github_code_parsing')`
      })
      
      if (sqlError) {
        console.log('Direct drop also failed:', sqlError.message)
        
        // Try to manually clear the table
        console.log('\n3️⃣ Trying manual table truncate...')
        const { error: truncateError } = await supabase.rpc('query_json', {
          query: `TRUNCATE TABLE pgmq.github_code_parsing`
        })
        
        if (truncateError) {
          console.log('Truncate failed:', truncateError.message)
        } else {
          console.log('✅ Table truncated successfully')
        }
      } else {
        console.log('✅ Queue dropped successfully')
      }
    } else {
      console.log('✅ Queue dropped successfully')
    }
    
    // Try to create the queue again
    console.log('\n4️⃣ Creating queue...')
    const { error: createError } = await supabase.rpc('pgmq_create', {
      p_queue_name: 'github_code_parsing'
    })
    
    if (createError) {
      console.log('Create failed:', createError.message)
      
      // Try direct SQL
      const { error: sqlCreateError } = await supabase.rpc('query_json', {
        query: `SELECT pgmq.create('github_code_parsing')`
      })
      
      if (sqlCreateError) {
        console.log('Direct create also failed:', sqlCreateError.message)
      } else {
        console.log('✅ Queue created via direct SQL')
      }
    } else {
      console.log('✅ Queue created successfully')
    }
    
    // Final check
    console.log('\n📊 Final queue check...')
    const { data: metrics } = await supabase.rpc('pgmq_metrics', {
      p_queue_name: 'github_code_parsing'
    })
    
    if (metrics && metrics.length > 0) {
      console.log('Queue status:', metrics[0])
    }
    
  } catch (error) {
    console.error('Error:', error)
  }
}

// Run the recreation
recreateQueue()