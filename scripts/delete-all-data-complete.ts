#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

async function deleteAllDataComplete() {
  console.log('=== COMPLETE DATA DELETION ===\n')
  console.log('⚠️  WARNING: This will delete EVERYTHING from both Supabase and Neo4j!')
  console.log('Press Ctrl+C within 5 seconds to cancel...\n')
  
  await new Promise(resolve => setTimeout(resolve, 5000))
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  // 1. Clear ALL queues completely
  console.log('1. Purging all message queues...')
  
  // Purge memory ingestion queue
  try {
    let hasMessages = true
    while (hasMessages) {
      const { data: msgs } = await supabase.rpc('pgmq_read', {
        queue_name: 'memory_ingestion',
        vt: 1,
        qty: 1000
      })
      
      if (msgs && msgs.length > 0) {
        console.log(`  - Purging ${msgs.length} messages from memory_ingestion`)
        for (const msg of msgs) {
          await supabase.rpc('pgmq_delete', {
            queue_name: 'memory_ingestion',
            msg_id: msg.msg_id
          })
        }
      } else {
        hasMessages = false
      }
    }
    console.log('  ✓ memory_ingestion queue purged')
  } catch (e) {
    console.error('  ! Error purging memory queue:', e.message)
  }
  
  // Purge pattern detection queue
  try {
    let hasMessages = true
    while (hasMessages) {
      const { data: msgs } = await supabase.rpc('pgmq_read', {
        queue_name: 'pattern_detection',
        vt: 1,
        qty: 1000
      })
      
      if (msgs && msgs.length > 0) {
        console.log(`  - Purging ${msgs.length} messages from pattern_detection`)
        for (const msg of msgs) {
          await supabase.rpc('pgmq_delete', {
            queue_name: 'pattern_detection',
            msg_id: msg.msg_id
          })
        }
      } else {
        hasMessages = false
      }
    }
    console.log('  ✓ pattern_detection queue purged')
  } catch (e) {
    console.error('  ! Error purging pattern queue:', e.message)
  }
  
  // 2. Delete from Supabase (in correct order to avoid FK constraints)
  console.log('\n2. Deleting all data from Supabase...')
  
  // Delete in dependency order
  const tables = [
    'pattern_processor_logs',
    'code_processing_queue',
    'code_processing_tasks',
    'code_entities',
    'code_files',
    'memories',
    'processed_memories',
    'memory_queue'
  ]
  
  for (const table of tables) {
    try {
      const { error, count } = await supabase
        .from(table)
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all
      
      if (error) {
        console.log(`  ! Error deleting ${table}: ${error.message}`)
      } else {
        console.log(`  ✓ Deleted all records from ${table}`)
      }
    } catch (e) {
      console.log(`  ! Table ${table} might not exist or is empty`)
    }
  }
  
  // 3. Delete from Neo4j
  console.log('\n3. Deleting all data from Neo4j...')
  
  const driver = neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
  )
  
  const session = driver.session()
  
  try {
    // Delete ALL nodes and relationships in one query
    console.log('  - Deleting all nodes and relationships...')
    const result = await session.run(`
      MATCH (n)
      DETACH DELETE n
      RETURN count(n) as deletedCount
    `)
    
    const deletedCount = result.records[0]?.get('deletedCount').toInt() || 0
    console.log(`  ✓ Deleted ${deletedCount} nodes and all relationships`)
    
    // Verify nothing is left
    const verifyResult = await session.run(`
      MATCH (n)
      RETURN count(n) as remainingCount
    `)
    
    const remainingCount = verifyResult.records[0]?.get('remainingCount').toInt() || 0
    if (remainingCount > 0) {
      console.log(`  ⚠️  Warning: ${remainingCount} nodes still remain`)
    } else {
      console.log('  ✓ Neo4j is completely empty')
    }
    
  } catch (error) {
    console.error('  ! Neo4j error:', error.message)
  } finally {
    await session.close()
    await driver.close()
  }
  
  // 4. Clear any archived queue messages
  console.log('\n4. Clearing archived queue messages...')
  try {
    await supabase.rpc('pgmq_purge_archive', {
      queue_name: 'memory_ingestion'
    })
    console.log('  ✓ Purged memory_ingestion archive')
  } catch (e) {
    console.log('  - No archive purge function or already empty')
  }
  
  try {
    await supabase.rpc('pgmq_purge_archive', {
      queue_name: 'pattern_detection'
    })
    console.log('  ✓ Purged pattern_detection archive')
  } catch (e) {
    console.log('  - No archive purge function or already empty')
  }
  
  console.log('\n✅ Complete data deletion finished!')
  console.log('\nThe system is now completely clean and ready for fresh data.')
  console.log('Camille can start sending data and it will be processed from scratch.')
}

deleteAllDataComplete().catch(console.error)