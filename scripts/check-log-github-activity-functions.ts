#!/usr/bin/env npx tsx

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { resolve } from 'path'

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkFunctions() {
  console.log('Checking log_github_activity functions...\n')

  // Query to find all functions named log_github_activity
  const { data, error } = await supabase.rpc('pgmq_send', {
    queue_name: 'dummy',
    msg: {}
  }).maybeSingle()

  // Actually, let's use a direct query
  const query = `
    SELECT 
      p.proname as function_name,
      pg_get_function_arguments(p.oid) as arguments,
      pg_get_function_result(p.oid) as return_type
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'log_github_activity'
      AND n.nspname = 'public'
  `

  const { data: functions, error: queryError } = await supabase
    .rpc('query_raw', { query })
    .single()

  if (queryError) {
    // Try a simpler approach
    console.log('Direct query failed, trying simpler approach...')
    
    // Just check if we can call the function
    try {
      await supabase.rpc('log_github_activity', {
        p_function_name: 'test',
        p_level: 'info',
        p_message: 'test'
      })
      console.log('Function exists and is callable')
    } catch (e) {
      console.log('Function error:', e)
    }
  } else {
    console.log('Functions found:', functions)
  }
}

checkFunctions().catch(console.error)