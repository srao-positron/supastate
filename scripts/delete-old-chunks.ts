#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

async function deleteOldChunks() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  const sessionId = 'ca8496db-d906-402f-9c2f-6ff73252ac3d'
  
  console.log(`Deleting all chunks with session ID: ${sessionId}\n`)
  
  // Count how many we're deleting
  const { count } = await supabase
    .from('memories')
    .select('*', { count: 'exact', head: true })
    .like('chunk_id', `${sessionId}%`)
    
  console.log(`Found ${count} memories to delete`)
  
  // Delete them
  const { error } = await supabase
    .from('memories')
    .delete()
    .like('chunk_id', `${sessionId}%`)
    
  if (error) {
    console.error('Error deleting:', error)
  } else {
    console.log(`✅ Deleted ${count} memories with old session ID`)
  }
  
  // Check remaining memories
  const { count: remaining } = await supabase
    .from('memories')
    .select('*', { count: 'exact', head: true })
    
  console.log(`\nRemaining memories in database: ${remaining}`)
}

deleteOldChunks().catch(console.error)