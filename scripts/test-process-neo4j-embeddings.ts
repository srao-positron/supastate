#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

async function testProcessNeo4jEmbeddings() {
  console.log('=== TESTING PROCESS-NEO4J-EMBEDDINGS ===\n')
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  // Get a sample memory
  const { data: memory } = await supabase
    .from('memories')
    .select('*')
    .limit(1)
    .single()
    
  if (!memory) {
    console.log('No memories found')
    return
  }
  
  console.log('Testing with memory:', memory.id)
  console.log('Content preview:', memory.content.substring(0, 100) + '...')
  
  // Call process-neo4j-embeddings
  const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/process-neo4j-embeddings`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      memories: [memory],
      user_id: memory.user_id,
      workspace_id: memory.workspace_id || `user:${memory.user_id}`
    })
  })
  
  console.log('\nResponse status:', response.status)
  const text = await response.text()
  console.log('Response:', text)
  
  // Try to parse as JSON
  try {
    const json = JSON.parse(text)
    console.log('\nParsed response:', JSON.stringify(json, null, 2))
  } catch (e) {
    console.log('\nCould not parse as JSON')
  }
}

testProcessNeo4jEmbeddings().catch(console.error)