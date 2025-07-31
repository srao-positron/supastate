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

async function readGithubQueueMessages() {
  console.log('🔍 Reading messages from github_code_parsing queue...\n')
  
  try {
    // Try to read messages without consuming them (visibility timeout of 0)
    const { data: messages, error: readError } = await supabase.rpc('pgmq_read', {
      queue_name: 'github_code_parsing',
      vt: 0, // 0 second visibility timeout - just peek
      qty: 10
    })
    
    if (readError) {
      console.error('Error reading messages:', readError)
      
      // Try alternative approach - direct query to pgmq schema
      console.log('\n🔍 Trying alternative approach...')
      const { data: tables, error: tablesError } = await supabase
        .from('information_schema.tables')
        .select('table_schema, table_name')
        .ilike('table_name', '%github_code_parsing%')
        
      if (!tablesError && tables) {
        console.log('Found tables:', tables)
      }
      
      return
    }
    
    if (!messages || messages.length === 0) {
      console.log('No messages found in queue')
      return
    }
    
    console.log(`📦 Found ${messages.length} messages:\n`)
    
    messages.forEach((msg: any, index: number) => {
      console.log(`--- Message ${index + 1} ---`)
      console.log(`ID: ${msg.msg_id}`)
      console.log(`Enqueued: ${msg.enqueued_at}`)
      console.log(`Read Count: ${msg.read_ct}`)
      console.log(`VT: ${msg.vt}`)
      
      if (msg.message) {
        console.log('Message Content:')
        console.log(JSON.stringify(msg.message, null, 2))
      }
      console.log('')
    })
    
  } catch (error) {
    console.error('Error:', error)
  }
}

// Run the check
readGithubQueueMessages()