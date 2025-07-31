#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

async function checkConstraints() {
  console.log('=== Checking Database Constraints ===\n')
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  // Check if there's a memory with this chunk
  const chunkId = 'ca8496db-d906-402f-9c2f-6ff73252ac3d-chunk-7'
  
  const { data: memory, error } = await supabase
    .from('memories')
    .select('*')
    .eq('chunk_id', chunkId)
    .single()
    
  if (memory) {
    console.log('Found memory with chunk ID:', chunkId)
    console.log('- ID:', memory.id)
    console.log('- Created:', new Date(memory.created_at).toLocaleString())
    console.log('- User ID:', memory.user_id)
    console.log('- Workspace ID:', memory.workspace_id)
    console.log('- Project:', memory.project_name)
  } else {
    console.log('No memory found with chunk ID:', chunkId)
    if (error) console.log('Error:', error.message)
  }
  
  // Try to manually insert a test record to see what constraint is firing
  console.log('\nTrying to insert a test memory...')
  
  const testMemory = {
    content: 'Test memory',
    project_name: 'test',
    chunk_id: 'test-chunk-' + Date.now(),
    user_id: 'a02c3fed-3a24-442f-becc-97bac8b75e90',
    team_id: null,
    type: 'general',
    metadata: {}
  }
  
  const { data: inserted, error: insertError } = await supabase
    .from('memories')
    .insert(testMemory)
    .select()
    .single()
    
  if (inserted) {
    console.log('✅ Test memory inserted successfully')
    // Clean it up
    await supabase.from('memories').delete().eq('id', inserted.id)
  } else {
    console.log('❌ Insert failed:', insertError)
  }
  
  // Check all memories
  const { count } = await supabase
    .from('memories')
    .select('*', { count: 'exact', head: true })
    
  console.log('\nTotal memories in database:', count)
  
  // Check for the specific session
  const { data: sessionMemories } = await supabase
    .from('memories')
    .select('chunk_id, created_at')
    .like('chunk_id', 'ca8496db-d906-402f-9c2f-6ff73252ac3d%')
    .order('created_at', { ascending: false })
    .limit(5)
    
  if (sessionMemories && sessionMemories.length > 0) {
    console.log(`\nFound ${sessionMemories.length} memories from session ca8496db-d906-402f-9c2f-6ff73252ac3d:`)
    for (const mem of sessionMemories) {
      console.log(`- ${mem.chunk_id} (${new Date(mem.created_at).toLocaleTimeString()})`)
    }
  }
}

checkConstraints().catch(console.error)