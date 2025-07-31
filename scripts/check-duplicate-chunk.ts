#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

async function checkDuplicateChunk() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  const chunkId = 'ca8496db-d906-402f-9c2f-6ff73252ac3d-chunk-58'
  
  console.log(`Checking for chunk: ${chunkId}\n`)
  
  // Check in memories table
  const { data: memory, error } = await supabase
    .from('memories')
    .select('id, chunk_id, created_at, project_name, user_id')
    .eq('chunk_id', chunkId)
    .single()
    
  if (memory) {
    console.log('Found memory with this chunk ID:')
    console.log(`- ID: ${memory.id}`)
    console.log(`- Created: ${new Date(memory.created_at).toLocaleString()}`)
    console.log(`- Project: ${memory.project_name}`)
    console.log(`- User: ${memory.user_id}`)
  } else {
    console.log('No memory found with this chunk ID')
    if (error) console.log('Error:', error.message)
  }
  
  // Check total memories
  const { count } = await supabase
    .from('memories')
    .select('*', { count: 'exact', head: true })
    
  console.log(`\nTotal memories in database: ${count}`)
  
  // Check for similar chunk IDs
  const { data: similar } = await supabase
    .from('memories')
    .select('chunk_id')
    .like('chunk_id', 'ca8496db-d906-402f-9c2f-6ff73252ac3d%')
    .limit(10)
    
  if (similar && similar.length > 0) {
    console.log(`\nFound ${similar.length} chunks with similar IDs:`)
    for (const s of similar) {
      console.log(`- ${s.chunk_id}`)
    }
  }
}

checkDuplicateChunk().catch(console.error)