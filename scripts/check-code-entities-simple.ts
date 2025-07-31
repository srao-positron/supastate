#!/usr/bin/env npx tsx

/**
 * Simple check for code entities
 */

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkCodeEntities() {
  console.log('=== Checking Code Entities ===\n')

  // 1. Count total entities
  const { count } = await supabase
    .from('code_entities')
    .select('*', { count: 'exact', head: true })

  console.log(`Total code entities: ${count || 0}`)

  // 2. Show recent entities
  const { data: recent, error } = await supabase
    .from('code_entities')
    .select('id, file_path, user_id, created_at, metadata')
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) {
    console.error('Error fetching entities:', error)
  } else if (recent && recent.length > 0) {
    console.log(`\nMost recent entities:`)
    recent.forEach(entity => {
      const workspaceId = entity.metadata?.workspaceId || 'no-workspace'
      console.log(`  - ${entity.file_path}`)
      console.log(`    ID: ${entity.id}`)
      console.log(`    User: ${entity.user_id}`)
      console.log(`    Created: ${entity.created_at}`)
      console.log(`    Workspace: ${workspaceId}`)
    })
  } else {
    console.log('\nNo code entities found')
  }

  // 3. Check entities from last 2 minutes
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()
  const { data: newEntities, count: newCount } = await supabase
    .from('code_entities')
    .select('*', { count: 'exact' })
    .gte('created_at', twoMinutesAgo)

  console.log(`\nEntities created in last 2 minutes: ${newCount || 0}`)

  // 4. Check queue (direct table query)
  try {
    const { data: queueData } = await supabase
      .from('pgmq.code_ingestion')
      .select('msg_id, enqueued_at, message')
      .order('enqueued_at', { ascending: false })
      .limit(5)

    if (queueData && queueData.length > 0) {
      console.log(`\nQueue messages (${queueData.length}):`)
      queueData.forEach(msg => {
        console.log(`  - Message ${msg.msg_id}: ${msg.enqueued_at}`)
      })
    } else {
      console.log('\nNo messages in queue')
    }
  } catch (e) {
    console.log('\nCould not check queue directly')
  }

  process.exit(0)
}

checkCodeEntities().catch(console.error)