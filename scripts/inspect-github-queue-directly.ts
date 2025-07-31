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

async function inspectGithubQueue() {
  console.log('🔍 Inspecting github_code_parsing queue directly...\n')
  
  try {
    // First check what tables exist in pgmq schema
    try {
      const { data: tables, error: tablesError } = await supabase
        .rpc('get_queue_tables', {})
      
      if (!tablesError && tables) {
        console.log('Available queue tables:', tables)
      }
    } catch (e) {
      // Ignore if function doesn't exist
    }
    
    // Try to read a message with actual visibility timeout to see what's in the queue
    console.log('\n📦 Attempting to read a message from the queue...')
    const { data: messages, error: readError } = await supabase.rpc('pgmq_read', {
      queue_name: 'github_code_parsing',
      vt: 30, // 30 second visibility timeout
      qty: 1
    })
    
    if (readError) {
      console.error('Error reading message:', readError)
      return
    }
    
    if (!messages || messages.length === 0) {
      console.log('No messages could be read from the queue')
      return
    }
    
    console.log(`\n✅ Successfully read ${messages.length} message(s):\n`)
    
    messages.forEach((msg: any, index: number) => {
      console.log(`--- Message ${index + 1} ---`)
      console.log(`ID: ${msg.msg_id}`)
      console.log(`Enqueued: ${msg.enqueued_at}`)
      console.log(`Read Count: ${msg.read_ct}`)
      console.log(`VT: ${msg.vt}`)
      
      if (msg.message) {
        console.log('\nMessage Content:')
        console.log(JSON.stringify(msg.message, null, 2))
        
        // Show what the message contains
        const { repository_id, file_path, language, file_id } = msg.message
        console.log('\nMessage Summary:')
        console.log(`  Repository ID: ${repository_id}`)
        console.log(`  File: ${file_path}`)
        console.log(`  Language: ${language}`)
        console.log(`  File ID: ${file_id}`)
      }
      console.log('')
    })
    
    // Important: Put the message back by deleting it (since we don't want to process it here)
    console.log('⚠️  Note: This message has been read with a 30-second visibility timeout.')
    console.log('It will become visible again for processing after the timeout expires.')
    
  } catch (error) {
    console.error('Error:', error)
  }
}

// Run the inspection
inspectGithubQueue()