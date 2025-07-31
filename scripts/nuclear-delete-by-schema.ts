#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

async function nuclearDeleteBySchema() {
  console.log('=== NUCLEAR DELETE BY SCHEMA - Clearing ALL ingested data ===\n')
  console.log('⚠️  This will delete ALL ingested data (memories, code, patterns, etc.)')
  console.log('✅  User, workspace, and team data will be PRESERVED')
  console.log('Press Ctrl+C within 5 seconds to cancel...\n')
  
  await new Promise(resolve => setTimeout(resolve, 5000))
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  // 1. First clear all queues
  console.log('1. Purging all queues...')
  const queues = ['memory_ingestion', 'pattern_detection', 'code_ingestion']
  
  for (const queue of queues) {
    try {
      let hasMessages = true
      let totalDeleted = 0
      
      while (hasMessages) {
        const { data: msgs } = await supabase.rpc('pgmq_read', {
          queue_name: queue,
          vt: 1,
          qty: 1000
        })
        
        if (msgs && msgs.length > 0) {
          for (const msg of msgs) {
            await supabase.rpc('pgmq_delete', {
              queue_name: queue,
              msg_id: msg.msg_id
            })
          }
          totalDeleted += msgs.length
        } else {
          hasMessages = false
        }
      }
      
      if (totalDeleted > 0) {
        console.log(`  ✓ Deleted ${totalDeleted} messages from ${queue}`)
      }
      
      // Purge archive
      try {
        await supabase.rpc('pgmq_purge_archive', { queue_name: queue })
        console.log(`  ✓ Purged ${queue} archive`)
      } catch (e) {
        // Archive might not exist
      }
    } catch (e) {
      // Queue might not exist
    }
  }
  
  // 2. Query the database schema to find ALL tables with chunk_id or session_id columns
  console.log('\n2. Finding all tables with chunk_id or session_id columns...')
  
  // We need to use raw SQL for this
  // First, let's get all public tables - COMPREHENSIVE list
  const knownTables = [
    // Memory related
    'memories',
    'memory_queue',
    'memory_embeddings',
    'memory_cache',
    'processed_memories',
    'memory_chunks',
    'memory_sessions',
    
    // Code related
    'code_files',
    'code_entities',
    'code_chunks',
    'code_sessions',
    'code_processing_queue',
    'code_processing_tasks',
    'code_embeddings',
    'code_cache',
    
    // Embedding related
    'embeddings',
    'embedding_queue',
    'embedding_processed',
    'embedding_cache',
    
    // Pattern related
    'pattern_processor_logs',
    'pattern_detection_queue',
    'pattern_detection_history',
    'patterns',
    'pattern_cache',
    
    // Chunk/Session tracking
    'chunks',
    'sessions',
    'chunk_registry',
    'session_registry',
    'chunk_hashes',
    'content_hashes',
    
    // Processing/Ingestion tracking
    'ingestion_history',
    'ingestion_cache',
    'processing_logs',
    'error_logs',
    'deduplication_cache'
  ]
  
  console.log('\n3. Checking and clearing tables...')
  
  for (const table of knownTables) {
    try {
      // First check if table exists and get sample
      const { data: sample, error: sampleError } = await supabase
        .from(table)
        .select('*')
        .limit(1)
        
      if (sampleError) {
        if (sampleError.code !== '42P01') { // Not "table doesn't exist" error
          console.log(`  ! Error checking ${table}: ${sampleError.message}`)
        }
        continue
      }
      
      // Check what columns it has
      if (sample && sample.length > 0) {
        const columns = Object.keys(sample[0])
        
        // For a COMPLETE reset, clear ALL tables related to our system
        // (excluding auth/system tables and user/workspace data)
        const isSystemTable = table.includes('auth') || 
                            table.includes('storage') || 
                            table.includes('realtime') ||
                            table.includes('supabase_functions') ||
                            table.includes('schema_migrations') ||
                            table === 'users' ||         // Keep users table
                            table === 'teams' ||         // Keep teams table  
                            table === 'team_members' ||  // Keep team members
                            table === 'workspaces' ||    // Keep workspaces
                            table === 'workspace_members' || // Keep workspace members
                            table === 'user_teams' ||    // Keep user-team associations
                            table === 'user_workspaces' || // Keep user-workspace associations
                            table.includes('billing') || // Keep billing data
                            table.includes('stripe') ||  // Keep payment data
                            table.includes('subscription') // Keep subscription data
        
        if (!isSystemTable) {
          // Get count
          const { count } = await supabase
            .from(table)
            .select('*', { count: 'exact', head: true })
            
          if (count > 0) {
            const relevantColumns = columns.filter(c => 
              c.includes('chunk') || 
              c.includes('session') || 
              c.includes('memory') ||
              c.includes('code') ||
              c.includes('content')
            )
            console.log(`  ⚠️  Table '${table}' has ${count} records`)
            if (relevantColumns.length > 0) {
              console.log(`     Relevant columns: ${relevantColumns.join(', ')}`)
            }
            
            // Delete all records - try multiple methods
            let deleted = false
            
            // Method 1: Delete with created_at
            const { error: deleteError } = await supabase
              .from(table)
              .delete()
              .gte('created_at', '1900-01-01') // Match everything
              
            if (!deleteError) {
              console.log(`     ✓ Deleted all ${count} records from ${table}`)
            } else {
              // Try alternative delete
              const { error: altError } = await supabase
                .from(table)
                .delete()
                .neq('id', '00000000-0000-0000-0000-000000000000')
                
              if (!altError) {
                console.log(`     ✓ Deleted all ${count} records from ${table} (alt method)`)
              } else {
                console.log(`     ❌ Failed to delete from ${table}: ${deleteError.message}`)
              }
            }
            
            // Verify deletion
            const { count: afterCount } = await supabase
              .from(table)
              .select('*', { count: 'exact', head: true })
              
            if (afterCount > 0) {
              console.log(`     ⚠️  WARNING: ${afterCount} records still remain in ${table}!`)
            }
          } else {
            console.log(`  ✓ Table '${table}' is already empty`)
          }
        }
      }
    } catch (e) {
      // Table doesn't exist or other error
    }
  }
  
  // 3. Neo4j wipe
  console.log('\n4. Wiping Neo4j completely...')
  
  const driver = neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
  )
  
  const session = driver.session()
  
  try {
    const result = await session.run(`
      MATCH (n)
      DETACH DELETE n
      RETURN count(n) as deletedCount
    `)
    
    const deletedCount = result.records[0]?.get('deletedCount').toInt() || 0
    console.log(`  ✓ Deleted ${deletedCount} nodes and all relationships`)
    
  } finally {
    await session.close()
    await driver.close()
  }
  
  // 4. Final verification
  console.log('\n5. Final verification...')
  
  const { count: memCount } = await supabase
    .from('memories')
    .select('*', { count: 'exact', head: true })
    
  console.log(`  Memories remaining: ${memCount || 0}`)
  
  if (memCount > 0) {
    console.log('\n❌ CRITICAL: Memories table still has records!')
    console.log('Run this SQL in Supabase SQL Editor:')
    console.log('DELETE FROM memories;')
    console.log('TRUNCATE TABLE memories RESTART IDENTITY CASCADE;')
  } else {
    console.log('\n✅ NUCLEAR DELETE COMPLETE!')
    console.log('All ingested data has been cleared.')
    console.log('User, workspace, and team data has been preserved.')
  }
}

nuclearDeleteBySchema().catch(console.error)