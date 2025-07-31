#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

async function resetAllData() {
  console.log('=== COMPLETE DATA RESET - Neo4j and Supabase ===\n')
  console.log('⚠️  This will DELETE:')
  console.log('   - All memories, code entities, and patterns')
  console.log('   - All queued messages and processing tasks')
  console.log('   - All Neo4j nodes and relationships')
  console.log('   - All embeddings and cached data\n')
  console.log('🛡️  This will PRESERVE:')
  console.log('   - Users, teams, workspaces, and memberships')
  console.log('   - Settings and configuration')
  console.log('   - Billing and subscription data')
  console.log('   - System tables and authentication\n')
  console.log('Press Ctrl+C within 5 seconds to cancel...\n')
  
  await new Promise(resolve => setTimeout(resolve, 5000))
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  // ========================================
  // STEP 1: Clear all pgmq queues
  // ========================================
  console.log('1. Clearing all message queues...')
  const queues = ['memory_ingestion', 'pattern_detection', 'code_ingestion']
  
  for (const queue of queues) {
    try {
      let hasMessages = true
      let totalDeleted = 0
      
      // Read and delete all messages
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
  
  // ========================================
  // STEP 2: Clear all Supabase tables
  // ========================================
  console.log('\n2. Clearing Supabase tables...')
  
  // Comprehensive list of all tables to clear
  const tablesToClear = [
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
    'error_logs', 'deduplication_cache'
  ]
  
  let totalDeleted = 0
  
  for (const table of tablesToClear) {
    try {
      // Check if table exists and has data
      const { count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
        
      if (count > 0) {
        // Try multiple deletion methods
        let deleted = false
        
        // Method 1: Delete with NOT NULL condition
        const { error: error1 } = await supabase
          .from(table)
          .delete()
          .not('id', 'is', null)
          
        if (!error1) {
          deleted = true
        } else {
          // Method 2: Delete with created_at condition
          const { error: error2 } = await supabase
            .from(table)
            .delete()
            .gte('created_at', '2000-01-01')
            
          if (!error2) {
            deleted = true
          } else {
            // Method 3: Batch deletion
            let batchDeleted = 0
            while (true) {
              const { data: batch } = await supabase
                .from(table)
                .select('id')
                .limit(100)
                
              if (!batch || batch.length === 0) break
              
              for (const record of batch) {
                await supabase.from(table).delete().eq('id', record.id)
                batchDeleted++
              }
            }
            if (batchDeleted > 0) {
              deleted = true
              count = batchDeleted
            }
          }
        }
        
        if (deleted) {
          console.log(`  ✓ Deleted ${count} records from ${table}`)
          totalDeleted += count
        } else {
          console.log(`  ❌ Failed to delete from ${table}`)
        }
      }
    } catch (e) {
      // Table doesn't exist - ignore
    }
  }
  
  if (totalDeleted === 0) {
    console.log('  ✓ All tables already empty')
  } else {
    console.log(`  Total records deleted: ${totalDeleted}`)
  }
  
  // ========================================
  // STEP 3: Clear Neo4j completely
  // ========================================
  console.log('\n3. Clearing Neo4j database...')
  
  const driver = neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
  )
  
  const session = driver.session()
  
  try {
    // Count nodes before deletion
    const countResult = await session.run(`
      MATCH (n)
      RETURN count(n) as totalNodes
    `)
    
    const totalNodes = countResult.records[0]?.get('totalNodes').toInt() || 0
    
    if (totalNodes > 0) {
      console.log(`  Found ${totalNodes} nodes to delete`)
      
      // Delete all nodes and relationships
      const deleteResult = await session.run(`
        MATCH (n)
        DETACH DELETE n
        RETURN count(n) as deletedCount
      `)
      
      const deletedCount = deleteResult.records[0]?.get('deletedCount').toInt() || 0
      console.log(`  ✓ Deleted ${deletedCount} nodes and all relationships`)
    } else {
      console.log('  ✓ Neo4j already empty')
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
  
  // ========================================
  // STEP 4: Final verification
  // ========================================
  console.log('\n4. Final verification...')
  
  // Check key tables
  const { count: memCount } = await supabase
    .from('memories')
    .select('*', { count: 'exact', head: true })
    
  const { count: codeCount } = await supabase
    .from('code_entities')
    .select('*', { count: 'exact', head: true })
    
  const { count: codeQueueCount } = await supabase
    .from('code_queue')
    .select('*', { count: 'exact', head: true })
  
  console.log(`  Memories remaining: ${memCount || 0}`)
  console.log(`  Code entities remaining: ${codeCount || 0}`)
  console.log(`  Code queue remaining: ${codeQueueCount || 0}`)
  
  // Check preserved tables
  const { count: userCount } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })
    
  const { count: teamCount } = await supabase
    .from('teams')
    .select('*', { count: 'exact', head: true })
  
  console.log('\n  Preserved data:')
  console.log(`  Users: ${userCount || 0}`)
  console.log(`  Teams: ${teamCount || 0}`)
  
  // Check Neo4j
  const neoDriver = neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
  )
  const neoSession = neoDriver.session()
  
  try {
    const neoCheck = await neoSession.run(`MATCH (n) RETURN count(n) as count`)
    const neoCount = neoCheck.records[0]?.get('count').toInt() || 0
    console.log(`  Neo4j nodes remaining: ${neoCount}`)
  } finally {
    await neoSession.close()
    await neoDriver.close()
  }
  
  if (memCount === 0 && codeCount === 0 && codeQueueCount === 0) {
    console.log('\n✅ COMPLETE RESET SUCCESSFUL!')
    console.log('All data has been cleared. The system is ready for fresh ingestion.')
    console.log('User accounts and settings have been preserved.')
  } else {
    console.log('\n⚠️  Some data may still remain. Please check individual tables.')
  }
}

resetAllData().catch(console.error)