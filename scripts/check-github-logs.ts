#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import * as path from 'path'

// Load .env.local file
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://service.supastate.ai'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function checkLogs() {
  console.log('📋 Checking GitHub ingestion logs...')
  
  // Check recent logs
  const { data: logs, error } = await supabase
    .from('github_ingestion_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20)
  
  if (error) {
    console.error('Error fetching logs:', error)
    return
  }
  
  console.log(`\nFound ${logs?.length || 0} recent logs:`)
  
  logs?.forEach(log => {
    console.log(`\n[${log.created_at}] ${log.function_name} - ${log.level}`)
    console.log(`Message: ${log.message}`)
    if (log.error_code) {
      console.log(`Error: ${log.error_code}`)
    }
    if (log.details) {
      console.log(`Details: ${JSON.stringify(log.details)}`)
    }
  })
  
  // Check for parser errors specifically
  const { data: parserErrors, error: parserError } = await supabase
    .from('github_ingestion_logs')
    .select('*')
    .eq('function_name', 'github-code-parser-worker')
    .eq('level', 'error')
    .order('created_at', { ascending: false })
    .limit(5)
  
  if (!parserError && parserErrors && parserErrors.length > 0) {
    console.log('\n❌ Recent parser errors:')
    parserErrors.forEach(log => {
      console.log(`\n[${log.created_at}]`)
      console.log(`Message: ${log.message}`)
      console.log(`Error: ${log.error_code}`)
      if (log.details) {
        console.log(`Details: ${JSON.stringify(log.details, null, 2)}`)
      }
    })
  }
}

checkLogs().catch(console.error)