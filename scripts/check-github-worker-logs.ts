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

async function checkGithubWorkerLogs() {
  console.log('🔍 Checking GitHub worker logs...\n')
  
  try {
    // Check github_activity table for logs
    const { data: logs, error } = await supabase
      .from('github_activity')
      .select('*')
      .eq('function_name', 'github-code-parser-worker')
      .order('created_at', { ascending: false })
      .limit(10)
    
    if (error) {
      console.error('Error fetching logs:', error)
      return
    }
    
    if (!logs || logs.length === 0) {
      console.log('No logs found for github-code-parser-worker')
      return
    }
    
    console.log(`Found ${logs.length} log entries:\n`)
    
    logs.forEach((log, index) => {
      console.log(`--- Log ${index + 1} ---`)
      console.log(`Time: ${log.created_at}`)
      console.log(`Level: ${log.level}`)
      console.log(`Message: ${log.message}`)
      if (log.repository_id) {
        console.log(`Repository ID: ${log.repository_id}`)
      }
      if (log.error_code) {
        console.log(`Error Code: ${log.error_code}`)
      }
      if (log.error_stack) {
        console.log(`Error Stack: ${log.error_stack}`)
      }
      if (log.details) {
        console.log(`Details: ${JSON.stringify(log.details, null, 2)}`)
      }
      console.log('')
    })
    
  } catch (error) {
    console.error('Error checking logs:', error)
  }
}

// Run the check
checkGithubWorkerLogs()