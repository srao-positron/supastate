#!/usr/bin/env npx tsx

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function checkCodeEntityTiming() {
  console.log('=== Code Entity Timing Analysis ===\n')
  
  // 1. Get failed entity IDs from worker logs
  const { data: failedLogs, error: logError } = await supabase
    .from('code_ingestion_worker_logs')
    .select('entity_id, created_at, error_message')
    .eq('status', 'error')
    .like('error_message', '%Code entity not found%')
    .order('created_at', { ascending: false })
    .limit(20)

  if (logError || !failedLogs || failedLogs.length === 0) {
    console.log('No failed logs found')
    return
  }

  console.log(`Found ${failedLogs.length} failed attempts\n`)

  // 2. For each failed entity, check when it was created (if at all)
  for (const log of failedLogs.slice(0, 10)) {
    console.log(`\n🔍 Entity ID: ${log.entity_id}`)
    console.log(`   Failed at: ${new Date(log.created_at).toLocaleString()}`)
    
    // Check if entity exists now
    const { data: entity, error: entityError } = await supabase
      .from('code_entities')
      .select('id, created_at, updated_at, file_path, project_name')
      .eq('id', log.entity_id)
      .single()

    if (entityError || !entity) {
      console.log(`   ❌ Entity still does not exist in database`)
      
      // Try to find if there's a similar entity with different ID
      // Extract file path from error message if possible
      const pathMatch = log.error_message.match(/path[:\s]+([^\s,]+)/)
      if (pathMatch) {
        const filePath = pathMatch[1]
        const { data: similarEntity } = await supabase
          .from('code_entities')
          .select('id, created_at, file_path')
          .eq('file_path', filePath)
          .single()
        
        if (similarEntity) {
          console.log(`   ⚠️  Found similar entity with different ID:`)
          console.log(`      ID: ${similarEntity.id}`)
          console.log(`      Created: ${new Date(similarEntity.created_at).toLocaleString()}`)
        }
      }
    } else {
      console.log(`   ✅ Entity exists in database`)
      console.log(`      Created: ${new Date(entity.created_at).toLocaleString()}`)
      console.log(`      File: ${entity.file_path}`)
      
      // Check timing
      const entityCreatedTime = new Date(entity.created_at).getTime()
      const workerFailedTime = new Date(log.created_at).getTime()
      
      if (entityCreatedTime > workerFailedTime) {
        console.log(`   ⚠️  TIMING ISSUE: Entity was created AFTER worker tried to process it!`)
        console.log(`      Delay: ${(entityCreatedTime - workerFailedTime) / 1000} seconds`)
      }
    }
  }

  // 3. Check for orphaned queue messages
  console.log('\n\n=== Checking Queue for Orphaned Messages ===\n')
  
  const { data: queueMessages } = await supabase
    .rpc('pgmq_read', {
      queue_name: 'code_ingestion',
      vt: 0,
      qty: 50
    })

  if (queueMessages && queueMessages.length > 0) {
    console.log(`Checking ${queueMessages.length} messages in queue...\n`)
    
    let orphanedCount = 0
    let validCount = 0
    
    for (const msg of queueMessages) {
      const entityId = msg.message?.code_entity_id
      if (!entityId) continue
      
      const { data: exists } = await supabase
        .from('code_entities')
        .select('id')
        .eq('id', entityId)
        .single()
      
      if (!exists) {
        orphanedCount++
        console.log(`❌ Orphaned message: Entity ${entityId} not in database`)
        console.log(`   Enqueued: ${new Date(msg.enqueued_at).toLocaleString()}`)
      } else {
        validCount++
      }
    }
    
    console.log(`\nSummary:`)
    console.log(`- Valid messages: ${validCount}`)
    console.log(`- Orphaned messages: ${orphanedCount}`)
    
    if (orphanedCount > 0) {
      console.log(`\n⚠️  Recommendation: Purge orphaned messages from queue`)
      console.log(`   These are pointing to non-existent entities`)
    }
  }

  // 4. Check for UUID format issues
  console.log('\n\n=== UUID Format Check ===\n')
  
  // Get some failed entity IDs
  const failedIds = failedLogs.map(log => log.entity_id).slice(0, 5)
  
  failedIds.forEach(id => {
    const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    console.log(`Entity ID: ${id}`)
    console.log(`Valid UUID format: ${isValidUUID ? 'YES' : 'NO'}`)
  })
}

checkCodeEntityTiming().catch(console.error)