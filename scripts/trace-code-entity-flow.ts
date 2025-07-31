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

async function traceCodeEntityFlow() {
  console.log('=== Tracing Code Entity Flow ===\n')
  
  // 1. Check recent queue messages
  console.log('📋 Recent Queue Messages:\n')
  const { data: messages, error: queueError } = await supabase
    .rpc('pgmq_read', { 
      queue_name: 'code_ingestion',
      vt: 0,  // Don't change visibility
      qty: 10  // Read 10 messages
    })

  if (queueError) {
    console.error('Error reading queue:', queueError)
    return
  }

  const entityIds = []
  if (messages && messages.length > 0) {
    console.log(`Found ${messages.length} messages in queue:`)
    messages.forEach(msg => {
      const entityId = msg.message?.code_entity_id
      const path = msg.message?.metadata?.path
      console.log(`- Entity ID: ${entityId}`)
      console.log(`  Path: ${path}`)
      console.log(`  Enqueued: ${new Date(msg.enqueued_at).toLocaleString()}\n`)
      if (entityId) entityIds.push(entityId)
    })
  } else {
    console.log('No messages in queue')
  }

  // 2. Check if these entity IDs exist in database
  if (entityIds.length > 0) {
    console.log('\n🔍 Checking Entity Existence:\n')
    
    for (const entityId of entityIds) {
      const { data: entity, error: entityError } = await supabase
        .from('code_entities')
        .select('id, file_path, project_name, entity_type, created_at, updated_at')
        .eq('id', entityId)
        .single()

      if (entityError) {
        console.log(`❌ Entity ${entityId}: NOT FOUND`)
        console.log(`   Error: ${entityError.message}\n`)
      } else {
        console.log(`✅ Entity ${entityId}: EXISTS`)
        console.log(`   File: ${entity.file_path}`)
        console.log(`   Project: ${entity.project_name}`)
        console.log(`   Type: ${entity.entity_type}`)
        console.log(`   Created: ${entity.created_at}`)
        console.log(`   Updated: ${entity.updated_at}\n`)
      }
    }
  }

  // 3. Check recent code_entities for the user
  console.log('\n📂 Recent Code Entities in Database:\n')
  const userId = 'a02c3fed-3a24-442f-becc-97bac8b75e90'
  
  const { data: recentEntities, error: recentError } = await supabase
    .from('code_entities')
    .select('id, file_path, project_name, entity_type, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10)

  if (recentError) {
    console.error('Error fetching recent entities:', recentError)
  } else if (recentEntities && recentEntities.length > 0) {
    console.log(`Found ${recentEntities.length} recent entities:`)
    recentEntities.forEach(entity => {
      console.log(`- ID: ${entity.id}`)
      console.log(`  File: ${entity.file_path}`)
      console.log(`  Project: ${entity.project_name}`)
      console.log(`  Type: ${entity.entity_type}`)
      console.log(`  Created: ${entity.created_at}\n`)
    })
  }

  // 4. Check for pattern in failed entity IDs
  console.log('\n🔍 Checking Failed Worker Logs:\n')
  
  const { data: workerLogs, error: logError } = await supabase
    .from('code_ingestion_worker_logs')
    .select('entity_id, error_message, created_at')
    .eq('status', 'error')
    .like('error_message', '%Code entity not found%')
    .order('created_at', { ascending: false })
    .limit(10)

  if (logError) {
    console.error('Error fetching worker logs:', logError)
  } else if (workerLogs && workerLogs.length > 0) {
    console.log(`Found ${workerLogs.length} failed worker attempts:`)
    
    for (const log of workerLogs) {
      console.log(`\n- Failed Entity ID: ${log.entity_id}`)
      console.log(`  Error: ${log.error_message}`)
      console.log(`  Time: ${new Date(log.created_at).toLocaleString()}`)
      
      // Check if this entity exists
      const { data: exists } = await supabase
        .from('code_entities')
        .select('id')
        .eq('id', log.entity_id)
        .single()
      
      console.log(`  Entity exists in DB: ${exists ? 'YES' : 'NO'}`)
    }
  }

  // 5. Cross-check: Are there entities in DB but with different IDs?
  console.log('\n\n📊 Cross-Reference Check:\n')
  
  // Get unique file paths from failed attempts
  const { data: failedPaths } = await supabase
    .rpc('get_failed_entity_paths')
    .single()
  
  if (failedPaths?.paths) {
    console.log('Checking if files exist with different IDs...')
    
    for (const path of failedPaths.paths.slice(0, 5)) {
      const { data: existingFile } = await supabase
        .from('code_entities')
        .select('id, file_path, created_at')
        .eq('file_path', path)
        .single()
      
      if (existingFile) {
        console.log(`\nFile: ${path}`)
        console.log(`  Current ID in DB: ${existingFile.id}`)
        console.log(`  Created: ${existingFile.created_at}`)
      }
    }
  }

  // 6. Summary
  console.log('\n\n=== Summary ===\n')
  console.log('Key findings:')
  console.log('1. Check if entity IDs in queue match IDs in database')
  console.log('2. Look for timing issues - are entities created AFTER being queued?')
  console.log('3. Check if there are duplicate entries with different IDs')
  console.log('4. Verify the INSERT is returning the correct ID')
}

// Create helper function if it doesn't exist
async function createHelperFunction() {
  await supabase.rpc('exec_sql', {
    sql: `
      CREATE OR REPLACE FUNCTION get_failed_entity_paths()
      RETURNS jsonb AS $$
      DECLARE
        result jsonb;
      BEGIN
        SELECT jsonb_build_object(
          'paths', array_agg(DISTINCT metadata->>'path')
        ) INTO result
        FROM pgmq.code_ingestion
        WHERE message->>'code_entity_id' IN (
          SELECT entity_id 
          FROM code_ingestion_worker_logs 
          WHERE status = 'error' 
          AND error_message LIKE '%Code entity not found%'
          LIMIT 20
        );
        
        RETURN COALESCE(result, '{"paths": []}'::jsonb);
      END;
      $$ LANGUAGE plpgsql;
    `
  }).catch(() => {
    // Function might already exist or exec_sql might not be available
  })
}

// Run the trace
createHelperFunction()
  .then(() => traceCodeEntityFlow())
  .catch(console.error)