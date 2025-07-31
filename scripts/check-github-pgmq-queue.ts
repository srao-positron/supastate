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

async function checkQueues() {
  console.log('📋 Checking PGMQ queues...')
  
  // Check github_code_parsing queue metrics
  const { data: queueMetrics, error: metricsError } = await supabase.rpc('pgmq_metrics', {
    p_queue_name: 'github_code_parsing'
  })
  
  if (metricsError) {
    console.error('Error checking queue metrics:', metricsError)
  } else if (queueMetrics && queueMetrics.length > 0) {
    console.log('\n🔧 github_code_parsing queue metrics:')
    console.log(JSON.stringify(queueMetrics[0], null, 2))
  }
  
  // Read messages without consuming them (with 0 visibility timeout)
  const { data: messages, error: readError } = await supabase.rpc('pgmq_read', {
    queue_name: 'github_code_parsing',
    vt: 0, // 0 visibility timeout means just peek
    qty: 5
  })
  
  if (readError) {
    console.error('Error reading messages:', readError)
  } else if (messages && messages.length > 0) {
    console.log(`\n📬 Found ${messages.length} messages in github_code_parsing queue:`)
    messages.forEach((msg: any, index: number) => {
      console.log(`\nMessage ${index + 1}:`)
      console.log(`- ID: ${msg.msg_id}`)
      console.log(`- File: ${msg.message?.file_path}`)
      console.log(`- Language: ${msg.message?.language}`)
      console.log(`- Repository: ${msg.message?.repository_id}`)
    })
  } else {
    console.log('\n📭 No messages in github_code_parsing queue')
  }
  
  // Check github_crawl queue metrics
  const { data: crawlMetrics, error: crawlError } = await supabase.rpc('pgmq_metrics', {
    p_queue_name: 'github_crawl'
  })
  
  if (!crawlError && crawlMetrics && crawlMetrics.length > 0) {
    console.log('\n🕷️ github_crawl queue metrics:')
    console.log(JSON.stringify(crawlMetrics[0], null, 2))
  }
  
  // Check all queue metrics to see what queues exist
  console.log('\n📂 Checking queue tables directly...')
  const { data: tables, error: tablesError } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'pgmq')
    .like('table_name', 'q_%')
  
  if (!tablesError && tables) {
    console.log('PGMQ queue tables:')
    tables.forEach((table: any) => {
      const queueName = table.table_name.replace('q_', '')
      console.log(`- ${queueName}`)
    })
  }
}

checkQueues().catch(console.error)