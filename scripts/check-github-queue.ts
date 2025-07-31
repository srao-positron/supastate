#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import * as path from 'path'

// Load .env.local file
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://service.supastate.ai'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY environment variable')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function checkQueue() {
  console.log('📋 Checking github_code_parsing_queue...')
  
  // Check queue items
  const { data: queueItems, error: queueError } = await supabase
    .from('github_code_parsing_queue')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20)
  
  if (queueError) {
    console.error('Queue query error:', queueError)
    return
  }
  
  console.log(`\nTotal items in queue: ${queueItems?.length || 0}`)
  
  // Group by status
  const statusCounts: Record<string, number> = {}
  queueItems?.forEach(item => {
    statusCounts[item.status] = (statusCounts[item.status] || 0) + 1
  })
  
  console.log('\nQueue status breakdown:')
  Object.entries(statusCounts).forEach(([status, count]) => {
    console.log(`- ${status}: ${count}`)
  })
  
  // Show recent items
  console.log('\nRecent queue items:')
  queueItems?.slice(0, 10).forEach(item => {
    console.log(`- ${item.file_path} (${item.status}) - ${item.created_at}`)
    if (item.error) {
      console.log(`  Error: ${item.error}`)
    }
  })
  
  // Check for specific repo
  const { data: camilleItems, error: camilleError } = await supabase
    .from('github_code_parsing_queue')
    .select('*')
    .eq('repo_owner', 'srao-positron')
    .eq('repo_name', 'camille')
    .order('created_at', { ascending: false })
  
  if (!camilleError && camilleItems) {
    console.log(`\n📦 Camille repo items: ${camilleItems.length}`)
    if (camilleItems.length > 0) {
      console.log('Sample files:')
      camilleItems.slice(0, 5).forEach(item => {
        console.log(`- ${item.file_path} (${item.status})`)
      })
    }
  }
}

checkQueue().catch(console.error)