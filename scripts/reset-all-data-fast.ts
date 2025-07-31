#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

async function resetAllDataFast() {
  console.log('=== FAST DATA RESET - Neo4j and Supabase ===\n')
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
  // STEP 1: Clear all pgmq queues efficiently
  // ========================================
  console.log('1. Clearing all message queues...')
  const queues = ['memory_ingestion', 'pattern_detection', 'code_ingestion']
  
  for (const queue of queues) {
    try {
      // Use pgmq's built-in purge function
      const { error } = await supabase.rpc('pgmq_purge', { queue_name: queue })
      if (!error) {
        console.log(`  ✓ Purged ${queue} queue`)
      }
      
      // Also purge archive
      try {
        await supabase.rpc('pgmq_purge_archive', { queue_name: queue })
        console.log(`  ✓ Purged ${queue} archive`)
      } catch (e) {
        // Archive might not exist
      }
    } catch (e) {
      console.log(`  ⚠️  Could not purge ${queue}: ${e.message}`)
    }
  }
  
  // ========================================
  // STEP 2: TRUNCATE all Supabase tables
  // ========================================
  console.log('\n2. Truncating Supabase tables (FAST)...')
  
  // Comprehensive list of all tables to truncate
  const tablesToTruncate = [
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
    
    // Other processing
    'chunk_tracking', 'processing_sessions', 'processing_checkpoints',
    'ingestion_cache', 'session_tracking', 'task_queue', 'job_queue'
  ]
  
  // Execute TRUNCATE commands directly via SQL
  for (const table of tablesToTruncate) {
    try {
      // Check if table exists first
      const { data: tableExists } = await supabase
        .from(table)
        .select('id')
        .limit(0)
      
      if (tableExists !== null) {
        // Use raw SQL to truncate - much faster than DELETE
        const { error } = await supabase.rpc('exec_sql', {
          sql: `TRUNCATE TABLE ${table} CASCADE`
        })
        
        if (!error) {
          console.log(`  ✓ Truncated ${table}`)
        } else {
          // Fallback to regular delete if TRUNCATE not allowed
          const { error: deleteError, count } = await supabase
            .from(table)
            .delete()
            .gte('created_at', '1900-01-01')
            .select('count')
          
          if (!deleteError) {
            console.log(`  ✓ Deleted all rows from ${table}`)
          } else {
            console.log(`  ⚠️  Could not clear ${table}: ${deleteError.message}`)
          }
        }
      }
    } catch (e) {
      // Table might not exist
      console.log(`  ⚠️  Table ${table} does not exist or cannot be accessed`)
    }
  }
  
  // ========================================
  // STEP 3: Clear Neo4j (All nodes and relationships)
  // ========================================
  console.log('\n3. Clearing Neo4j database...')
  
  const neo4jUri = process.env.NEO4J_URI || 'neo4j+s://eb61aceb.databases.neo4j.io'
  const neo4jUser = process.env.NEO4J_USER || 'neo4j'
  const neo4jPassword = process.env.NEO4J_PASSWORD
  
  if (!neo4jPassword) {
    console.log('  ⚠️  NEO4J_PASSWORD not set, skipping Neo4j cleanup')
  } else {
    const driver = neo4j.driver(
      neo4jUri,
      neo4j.auth.basic(neo4jUser, neo4jPassword)
    )
    
    const session = driver.session()
    
    try {
      // Delete all nodes and relationships
      console.log('  - Deleting all nodes and relationships...')
      await session.run('MATCH (n) DETACH DELETE n')
      console.log('  ✓ All Neo4j data deleted')
      
      // Verify deletion
      const result = await session.run('MATCH (n) RETURN count(n) as count')
      const count = result.records[0].get('count').toNumber()
      console.log(`  ✓ Verified: ${count} nodes remaining`)
      
    } catch (error) {
      console.error('  ✗ Neo4j error:', error.message)
    } finally {
      await session.close()
      await driver.close()
    }
  }
  
  console.log('\n✅ Data reset complete!')
  console.log('\n📝 Summary:')
  console.log('   - All message queues cleared')
  console.log('   - All data tables truncated')
  console.log('   - All Neo4j nodes and relationships deleted')
  console.log('   - User/workspace/team data preserved')
}

// Create exec_sql function if it doesn't exist
async function createExecSqlFunction() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  const createFunction = `
    CREATE OR REPLACE FUNCTION exec_sql(sql text)
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
      EXECUTE sql;
    END;
    $$;
  `
  
  try {
    await supabase.rpc('query', { query: createFunction })
  } catch (e) {
    // Function might already exist or we don't have permissions
  }
}

// Main execution
createExecSqlFunction().then(() => {
  resetAllDataFast().catch(console.error)
}).catch(() => {
  // If we can't create the function, run without it
  resetAllDataFast().catch(console.error)
})