#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

async function nuclearDeleteAll() {
  console.log('=== NUCLEAR DELETE - REMOVING ABSOLUTELY EVERYTHING ===\n')
  console.log('⚠️  This will delete ALL data from EVERY table!')
  console.log('Press Ctrl+C within 5 seconds to cancel...\n')
  
  await new Promise(resolve => setTimeout(resolve, 5000))
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  // 1. Purge ALL queues including archives
  console.log('1. Purging ALL queues and archives...')
  
  const queues = ['memory_ingestion', 'pattern_detection', 'code_ingestion']
  
  for (const queue of queues) {
    try {
      // Read and delete all messages
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
      
      // Try to purge archive
      try {
        await supabase.rpc('pgmq_purge_archive', { queue_name: queue })
        console.log(`  ✓ Purged ${queue} archive`)
      } catch (e) {
        // Archive might not exist
      }
    } catch (e) {
      console.log(`  - Queue ${queue} might not exist`)
    }
  }
  
  // 2. Delete from ALL Supabase tables
  console.log('\n2. Deleting from ALL Supabase tables...')
  
  // CRITICAL: Delete memories table first and verify it's empty
  console.log('  Deleting memories table (critical)...')
  
  // Get count before
  const { count: memoryCountBefore } = await supabase
    .from('memories')
    .select('*', { count: 'exact', head: true })
    
  if (memoryCountBefore > 0) {
    console.log(`    Found ${memoryCountBefore} memories to delete`)
    
    // Force delete all memories
    let deleted = 0
    let attempts = 0
    
    while (attempts < 5) {
      const { error } = await supabase
        .from('memories')
        .delete()
        .gte('created_at', '2000-01-01') // This should match everything
        
      if (!error) {
        break
      }
      
      // Try batch deletion if bulk fails
      console.log(`    Attempt ${attempts + 1} failed, trying batch deletion...`)
      const { data: batch } = await supabase
        .from('memories')
        .select('id')
        .limit(1000)
        
      if (batch && batch.length > 0) {
        for (const record of batch) {
          await supabase
            .from('memories')
            .delete()
            .eq('id', record.id)
          deleted++
        }
        console.log(`    Deleted ${deleted} records...`)
      } else {
        break
      }
      
      attempts++
    }
    
    // Verify memories are gone
    const { count: memoryCountAfter } = await supabase
      .from('memories')
      .select('*', { count: 'exact', head: true })
      
    if (memoryCountAfter === 0) {
      console.log(`    ✓ Successfully deleted all ${memoryCountBefore} memories`)
    } else {
      console.log(`    ❌ WARNING: ${memoryCountAfter} memories still remain!`)
      throw new Error('Failed to delete all memories - aborting')
    }
  } else {
    console.log('    ✓ Memories table already empty')
  }
  
  // Comprehensive list of ALL tables that might exist
  const allTables = [
    // Memory related (memories already handled above)
    'memory_queue',
    'memory_embeddings',
    'processed_memories',
    
    // Code related
    'code_files',
    'code_entities',
    'code_processing_queue',
    'code_processing_tasks',
    
    // Embedding related
    'embedding_queue',
    'embedding_processed',
    
    // Pattern related
    'pattern_processor_logs',
    'pattern_detection_queue',
    'pattern_detection_history',
    
    // Any other potential tables
    'ingestion_history',
    'processing_logs',
    'error_logs'
  ]
  
  for (const table of allTables) {
    try {
      // Try to delete everything
      const { error, count } = await supabase
        .from(table)
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all
      
      if (!error) {
        console.log(`  ✓ Cleared table: ${table}`)
      } else if (error.code === '42P01') {
        // Table doesn't exist
      } else {
        console.log(`  ! Error with ${table}: ${error.message}`)
      }
    } catch (e) {
      // Table doesn't exist or other error
    }
  }
  
  // 3. Neo4j complete wipe
  console.log('\n3. Wiping Neo4j completely...')
  
  const driver = neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
  )
  
  const session = driver.session()
  
  try {
    // Delete EVERYTHING
    const result = await session.run(`
      MATCH (n)
      DETACH DELETE n
      RETURN count(n) as deletedCount
    `)
    
    const deletedCount = result.records[0]?.get('deletedCount').toInt() || 0
    console.log(`  ✓ Deleted ${deletedCount} nodes and all relationships`)
    
    // Drop all indexes (optional - they'll recreate automatically)
    const indexes = await session.run(`SHOW INDEXES`)
    for (const index of indexes.records) {
      const indexName = index.get('name')
      if (indexName && !indexName.includes('constraint')) {
        try {
          await session.run(`DROP INDEX ${indexName}`)
          console.log(`  ✓ Dropped index: ${indexName}`)
        } catch (e) {
          // Some indexes might be system indexes
        }
      }
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
  
  // 4. Final verification
  console.log('\n4. Final verification...')
  
  const { count: memCount } = await supabase
    .from('memories')
    .select('*', { count: 'exact', head: true })
    
  console.log(`  Memories remaining: ${memCount || 0}`)
  
  const { data: queueCheck } = await supabase.rpc('pgmq_read', {
    queue_name: 'memory_ingestion',
    vt: 0,
    qty: 1
  })
  
  console.log(`  Queue messages remaining: ${queueCheck?.length || 0}`)
  
  console.log('\n🔥 NUCLEAR DELETE COMPLETE!')
  console.log('The system is completely empty and ready for fresh data.')
}

nuclearDeleteAll().catch(console.error)