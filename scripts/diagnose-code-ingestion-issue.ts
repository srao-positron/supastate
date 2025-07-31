#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

async function diagnoseIssue() {
  console.log('=== Diagnosing Code Ingestion Issue ===\n')

  try {
    // 1. Check recent code entities
    const { data: recentEntities, error: entitiesError } = await supabase
      .from('code_entities')
      .select('id, file_path, project_name, created_at, user_id')
      .eq('user_id', 'a02c3fed-3a24-442f-becc-97bac8b75e90')
      .order('created_at', { ascending: false })
      .limit(5)

    if (entitiesError) {
      console.error('Error checking entities:', entitiesError)
    } else {
      console.log('Recent code entities in database:')
      recentEntities?.forEach(entity => {
        console.log(`  - ${entity.id}: ${entity.file_path}`)
        console.log(`    Created: ${entity.created_at}`)
      })
    }

    // 2. Check recent worker errors
    const { data: errorLogs, error: logError } = await supabase
      .from('pattern_processor_logs')
      .select('message, details, created_at')
      .like('message', '%Code entity not found%')
      .order('created_at', { ascending: false })
      .limit(5)

    if (logError) {
      console.error('Error checking logs:', logError)
    } else {
      console.log('\n\nRecent "Code entity not found" errors:')
      errorLogs?.forEach(log => {
        const entityId = log.details?.code_entity_id || 
                        log.message.match(/Code entity not found: ([a-f0-9-]+)/)?.[1]
        console.log(`  - Entity ID: ${entityId}`)
        console.log(`    Time: ${log.created_at}`)
      })
    }

    // 3. Extract missing IDs and check if they exist
    const missingIds = errorLogs?.map(log => {
      return log.details?.code_entity_id || 
             log.message.match(/Code entity not found: ([a-f0-9-]+)/)?.[1]
    }).filter(Boolean) || []

    if (missingIds.length > 0) {
      console.log('\n\nChecking if "missing" entities actually exist:')
      const uniqueIds = [...new Set(missingIds)].slice(0, 3) // Check first 3 unique IDs
      
      for (const id of uniqueIds) {
        const { data, error } = await supabase
          .from('code_entities')
          .select('id, file_path, created_at')
          .eq('id', id)
          .single()

        if (error && error.code === 'PGRST116') {
          console.log(`  ❌ ${id}: NOT FOUND in database`)
        } else if (data) {
          console.log(`  ✅ ${id}: EXISTS - ${data.file_path}`)
        }
      }
    }

    // 4. Check code_processing_tasks
    const { data: tasks, error: tasksError } = await supabase
      .from('code_processing_tasks')
      .select('*')
      .eq('workspace_id', 'user:a02c3fed-3a24-442f-becc-97bac8b75e90')
      .order('created_at', { ascending: false })
      .limit(3)

    if (tasksError) {
      console.error('Error checking tasks:', tasksError)
    } else {
      console.log('\n\nRecent code processing tasks:')
      tasks?.forEach(task => {
        console.log(`  - Task ${task.id}: ${task.status}`)
        console.log(`    Project: ${task.project_name}`)
        console.log(`    Files: ${task.total_files}`)
        console.log(`    Created: ${task.created_at}`)
      })
    }

    console.log('\n\n=== DIAGNOSIS ===')
    console.log('The issue appears to be that:')
    console.log('1. Messages in the queue contain code_entity_id values that don\'t exist')
    console.log('2. This is likely because the upsert in ingest-code is not working correctly')
    console.log('3. The onConflict clause might be matching existing rows but not returning them')
    console.log('\n=== RECOMMENDED FIX ===')
    console.log('1. Clear the existing queue messages')
    console.log('2. Fix the ingest-code function to properly handle upserts')
    console.log('3. Re-ingest the code files')

  } catch (error) {
    console.error('Error:', error)
  }
}

diagnoseIssue().catch(console.error)