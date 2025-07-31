#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

async function findAllDataTables() {
  console.log('=== FINDING ALL TABLES WITH DATA ===\n')
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  // List of all possible tables to check
  const allTables = [
    // Memory related
    'memories', 'memory_queue', 'memory_embeddings', 'memory_cache',
    'processed_memories', 'memory_chunks', 'memory_sessions',
    
    // Code related
    'code_files', 'code_entities', 'code_queue', 'code_chunks',
    'code_sessions', 'code_processing_queue', 'code_processing_tasks',
    'code_embeddings', 'code_cache',
    
    // Pattern related
    'patterns', 'pattern_processor_logs', 'pattern_detection_queue',
    'pattern_detection_history', 'pattern_cache', 'pattern_checkpoints',
    
    // Embedding related
    'embeddings', 'embedding_queue', 'embedding_processed', 'embedding_cache',
    
    // Chunk/Session tracking
    'chunks', 'sessions', 'chunk_registry', 'session_registry',
    'chunk_hashes', 'content_hashes',
    
    // Processing/Ingestion tracking
    'ingestion_history', 'ingestion_cache', 'processing_logs',
    'error_logs', 'deduplication_cache',
    
    // Other potential tables
    'workspace_data', 'user_data', 'team_data'
  ]
  
  const tablesWithData = []
  const systemTables = []
  const emptyTables = []
  const nonExistentTables = []
  
  for (const table of allTables) {
    try {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
        
      if (error) {
        if (error.code === '42P01') {
          nonExistentTables.push(table)
        } else {
          console.log(`Error checking ${table}: ${error.message}`)
        }
      } else if (count > 0) {
        // Check if it's a system table we should preserve
        const isSystem = table === 'users' || 
                        table === 'teams' || 
                        table === 'team_members' ||
                        table === 'workspaces' ||
                        table === 'workspace_data' ||
                        table === 'user_data' ||
                        table === 'team_data'
        
        if (isSystem) {
          systemTables.push({ table, count })
        } else {
          tablesWithData.push({ table, count })
        }
      } else {
        emptyTables.push(table)
      }
    } catch (e) {
      // Table doesn't exist
      nonExistentTables.push(table)
    }
  }
  
  if (tablesWithData.length > 0) {
    console.log('📊 TABLES WITH DATA TO CLEAR:')
    for (const { table, count } of tablesWithData) {
      console.log(`   - ${table}: ${count} records`)
    }
  }
  
  if (systemTables.length > 0) {
    console.log('\n🛡️  SYSTEM TABLES TO PRESERVE:')
    for (const { table, count } of systemTables) {
      console.log(`   - ${table}: ${count} records`)
    }
  }
  
  if (emptyTables.length > 0) {
    console.log('\n✅ EMPTY TABLES:')
    console.log(`   ${emptyTables.join(', ')}`)
  }
  
  if (nonExistentTables.length > 0) {
    console.log('\n❌ NON-EXISTENT TABLES:')
    console.log(`   ${nonExistentTables.join(', ')}`)
  }
  
  // Check pgmq queues separately
  console.log('\n📬 CHECKING QUEUES:')
  const queues = ['memory_ingestion', 'pattern_detection', 'code_ingestion']
  
  for (const queue of queues) {
    try {
      const { data: msgs } = await supabase.rpc('pgmq_read', {
        queue_name: queue,
        vt: 0,
        qty: 1
      })
      
      if (msgs && msgs.length > 0) {
        // Read more to get count
        const { data: allMsgs } = await supabase.rpc('pgmq_read', {
          queue_name: queue,
          vt: 0,
          qty: 1000
        })
        console.log(`   - ${queue}: ${allMsgs?.length || 0} messages`)
      } else {
        console.log(`   - ${queue}: empty`)
      }
    } catch (e) {
      console.log(`   - ${queue}: not found or error`)
    }
  }
}

findAllDataTables().catch(console.error)