#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkMigrations() {
  console.log('=== Checking Applied Migrations ===\n')
  
  // Check applied migrations
  const { data: migrations, error } = await supabase
    .from('supabase_migrations.schema_migrations')
    .select('*')
    .order('inserted_at', { ascending: false })
    .limit(20)
  
  if (error) {
    console.error('Error fetching migrations:', error)
    
    // Try alternative table name
    const { data: altMigrations, error: altError } = await supabase
      .from('schema_migrations')
      .select('*')
      .order('inserted_at', { ascending: false })
      .limit(20)
      
    if (altError) {
      console.error('Alternative error:', altError)
    } else {
      console.log('Recent migrations:')
      altMigrations?.forEach(m => {
        console.log(`- ${m.version} (${new Date(m.inserted_at).toLocaleDateString()})`)
      })
    }
  } else {
    console.log('Recent migrations:')
    migrations?.forEach(m => {
      console.log(`- ${m.version} (${new Date(m.inserted_at).toLocaleDateString()})`)
    })
  }
  
  // Check if pgmq extension exists
  console.log('\n=== Checking pgmq Extension ===')
  const { data: extensions, error: extError } = await supabase
    .rpc('query_db', {
      query: "SELECT extname FROM pg_extension WHERE extname = 'pgmq'"
    })
    .single()
    
  if (extError) {
    // Try a simpler approach
    const { data: functions } = await supabase
      .rpc('query_db', {
        query: "SELECT proname FROM pg_proc WHERE proname LIKE 'pgmq%' LIMIT 5"
      })
    console.log('pgmq functions found:', functions)
  } else {
    console.log('pgmq extension installed:', extensions)
  }
  
  // Check if queue functions exist
  console.log('\n=== Checking Queue Functions ===')
  const functionNames = [
    'queue_pattern_detection_job',
    'queue_memory_ingestion_job', 
    'queue_code_ingestion_job'
  ]
  
  for (const func of functionNames) {
    const { data, error } = await supabase
      .rpc('query_db', {
        query: `SELECT proname FROM pg_proc WHERE proname = '${func}'`
      })
      .single()
      
    console.log(`${func}: ${data ? 'EXISTS' : 'NOT FOUND'}`)
  }
}

checkMigrations().catch(console.error)