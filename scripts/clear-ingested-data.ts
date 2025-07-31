#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

async function clearIngestedData() {
  console.log('=== CLEAR INGESTED DATA - Removing memories, code, and patterns ===\n')
  console.log('✅  This will DELETE:')
  console.log('   - All memories and code entities')
  console.log('   - All patterns and pattern logs')
  console.log('   - All embeddings and processing queues')
  console.log('   - All chunk/session tracking data\n')
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
  
  // 2. Clear specific tables related to ingested data
  console.log('\n2. Clearing ingested data tables...')
  
  // Tables to completely clear
  const tablesToClear = [
    // Memory related
    'memories',
    'memory_queue',
    'memory_embeddings',
    
    // Code related  
    'code_files',
    'code_entities',
    'code_queue',  // Added this!
    'code_processing_queue',
    'code_processing_tasks',
    
    // Pattern related
    'pattern_processor_logs',
    'pattern_detection_queue',
    'pattern_detection_history',
    
    // Embedding related
    'embedding_queue',
    'embedding_processed'
  ]
  
  for (const table of tablesToClear) {
    try {
      // First check if table exists
      const { count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
        
      if (count > 0) {
        // Delete all records
        const { error: deleteError } = await supabase
          .from(table)
          .delete()
          .gte('created_at', '1900-01-01') // Match everything
          
        if (!deleteError) {
          console.log(`  ✓ Deleted ${count} records from ${table}`)
        } else {
          // Try alternative delete
          const { error: altError } = await supabase
            .from(table)
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000')
            
          if (!altError) {
            console.log(`  ✓ Deleted ${count} records from ${table} (alt method)`)
          } else {
            console.log(`  ❌ Failed to delete from ${table}: ${deleteError.message}`)
          }
        }
      } else {
        console.log(`  - Table '${table}' is already empty`)
      }
    } catch (e) {
      // Table doesn't exist - skip silently
    }
  }
  
  // 3. Neo4j wipe - only ingested data
  console.log('\n3. Clearing Neo4j ingested data...')
  
  const driver = neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
  )
  
  const session = driver.session()
  
  try {
    // Delete only specific node types, not all nodes
    const nodeTypes = [
      'Memory',
      'CodeEntity', 
      'Pattern',
      'EntitySummary',
      'MemorySummary',
      'ProjectSummary',
      'DailySummary'
    ]
    
    let totalDeleted = 0
    
    for (const nodeType of nodeTypes) {
      const result = await session.run(`
        MATCH (n:${nodeType})
        WITH n, n AS nodeToDelete
        DETACH DELETE nodeToDelete
        RETURN count(n) as deletedCount
      `)
      
      const deletedCount = result.records[0]?.get('deletedCount').toInt() || 0
      if (deletedCount > 0) {
        console.log(`  ✓ Deleted ${deletedCount} ${nodeType} nodes`)
        totalDeleted += deletedCount
      }
    }
    
    console.log(`  Total Neo4j nodes deleted: ${totalDeleted}`)
    
  } finally {
    await session.close()
    await driver.close()
  }
  
  // 4. Final verification
  console.log('\n4. Final verification...')
  
  const { count: memCount } = await supabase
    .from('memories')
    .select('*', { count: 'exact', head: true })
    
  const { count: codeCount } = await supabase
    .from('code_entities')
    .select('*', { count: 'exact', head: true })
    
  const { count: patternCount } = await supabase
    .from('pattern_processor_logs')
    .select('*', { count: 'exact', head: true })
  
  console.log(`  Memories remaining: ${memCount || 0}`)
  console.log(`  Code entities remaining: ${codeCount || 0}`)
  console.log(`  Pattern logs remaining: ${patternCount || 0}`)
  
  // Check preserved tables
  const { count: userCount } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })
    
  const { count: workspaceCount } = await supabase
    .from('workspaces')
    .select('*', { count: 'exact', head: true })
    
  const { count: teamCount } = await supabase
    .from('teams')
    .select('*', { count: 'exact', head: true })
  
  console.log('\n  Preserved data:')
  console.log(`  Users: ${userCount || 0}`)
  console.log(`  Workspaces: ${workspaceCount || 0}`)
  console.log(`  Teams: ${teamCount || 0}`)
  
  if (memCount === 0 && codeCount === 0 && patternCount === 0) {
    console.log('\n✅ INGESTED DATA CLEARED!')
    console.log('All memories, code, and patterns have been removed.')
    console.log('User accounts and settings have been preserved.')
  } else {
    console.log('\n⚠️  Some data may still remain. Check individual tables.')
  }
}

clearIngestedData().catch(console.error)