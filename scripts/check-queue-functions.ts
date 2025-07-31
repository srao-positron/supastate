#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkQueueFunctions() {
  console.log('=== Checking Queue Functions ===\n')
  
  // Check if pgmq is installed
  console.log('1. Checking pgmq extension...')
  const { data: ext, error: extError } = await supabase
    .rpc('pg_extension_config_dump', {
      extname: 'pgmq'
    })
    .single()
    
  if (extError) {
    // Try a different approach
    const { data: extensions } = await supabase.rpc('pg_available_extensions').select()
    const pgmq = extensions?.find((e: any) => e.name === 'pgmq')
    console.log('pgmq available:', pgmq ? 'YES' : 'NO')
  }
  
  // List all functions with 'queue' in the name
  console.log('\n2. Looking for queue functions...')
  const { data: queueFuncs, error: funcError } = await supabase.rpc('pg_catalog.pg_get_functiondef', {
    query: `
      SELECT proname, prosrc 
      FROM pg_proc 
      WHERE proname LIKE '%queue%' 
      LIMIT 10
    `
  })
  
  if (funcError) {
    // Try direct SQL
    const { data, error } = await supabase.rpc('sql', {
      query: `
        SELECT n.nspname as schema, p.proname as name 
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE p.proname LIKE '%queue%'
        ORDER BY n.nspname, p.proname
        LIMIT 20
      `
    })
    
    if (error) {
      console.error('Could not list functions:', error.message)
    } else {
      console.log('Queue-related functions found:')
      data?.forEach((f: any) => console.log(`  - ${f.schema}.${f.name}`))
    }
  }
  
  // Check specific functions
  console.log('\n3. Checking specific queue functions...')
  const functions = [
    'queue_pattern_detection_job',
    'queue_memory_ingestion_job',
    'queue_code_ingestion_job'
  ]
  
  for (const func of functions) {
    try {
      // Try to call with dummy params to see if it exists
      const { error } = await supabase.rpc(func, {
        p_batch_id: '00000000-0000-0000-0000-000000000000',
        p_pattern_types: ['test'],
        p_limit: 1,
        p_workspace_id: 'test'
      })
      
      if (error?.message.includes('Could not find')) {
        console.log(`  ❌ ${func}: NOT FOUND`)
      } else {
        console.log(`  ✅ ${func}: EXISTS`)
      }
    } catch (e) {
      console.log(`  ❌ ${func}: ERROR - ${e}`)
    }
  }
  
  // Check pgmq schema permissions
  console.log('\n4. Checking pgmq schema permissions...')
  const { data: schemas } = await supabase.rpc('sql', {
    query: `
      SELECT nspname, nspacl 
      FROM pg_namespace 
      WHERE nspname = 'pgmq'
    `
  })
  
  if (schemas && schemas.length > 0) {
    console.log('pgmq schema permissions:', schemas[0].nspacl)
  }
}

checkQueueFunctions().catch(console.error)