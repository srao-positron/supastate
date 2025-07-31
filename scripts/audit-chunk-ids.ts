#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

async function auditChunkIds() {
  console.log('=== AUDITING ALL TABLES FOR CHUNK IDS ===\n')
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  // List of tables that might contain chunk_id or session_id
  const tablesToCheck = [
    'memories',
    'processed_memories',
    'memory_queue',
    'code_processing_queue',
    'code_entities',
    'pattern_processor_logs',
    'embedding_queue',
    'embedding_processed',
    'memory_embeddings'
  ]
  
  for (const table of tablesToCheck) {
    try {
      // First check if table exists and has data
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
        
      if (error) {
        console.log(`❌ Table '${table}' - Error or doesn't exist: ${error.message}`)
        continue
      }
      
      if (count === 0) {
        console.log(`✅ Table '${table}' - Empty (0 records)`)
        continue
      }
      
      console.log(`⚠️  Table '${table}' - Contains ${count} records`)
      
      // Try to get a sample to see what columns it has
      const { data: sample } = await supabase
        .from(table)
        .select('*')
        .limit(1)
        
      if (sample && sample.length > 0) {
        const columns = Object.keys(sample[0])
        const chunkRelatedColumns = columns.filter(col => 
          col.includes('chunk') || 
          col.includes('session') ||
          col.includes('memory_id')
        )
        
        if (chunkRelatedColumns.length > 0) {
          console.log(`   Found columns: ${chunkRelatedColumns.join(', ')}`)
          
          // Delete all records from this table
          const { error: deleteError } = await supabase
            .from(table)
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000')
            
          if (deleteError) {
            console.log(`   ❌ Failed to delete: ${deleteError.message}`)
          } else {
            console.log(`   ✅ Deleted all ${count} records`)
          }
        }
      }
    } catch (e) {
      console.log(`❌ Table '${table}' - Error checking: ${e instanceof Error ? e.message : e}`)
    }
  }
  
  // Also check pgmq archive tables
  console.log('\n=== Checking PGMQ Archive Tables ===')
  
  try {
    // Check pgmq archive for memory_ingestion
    const { data: memArchive } = await supabase.rpc('pgmq_read_archive', {
      queue_name: 'memory_ingestion',
      qty: 100
    })
    
    if (memArchive && memArchive.length > 0) {
      console.log(`⚠️  Found ${memArchive.length} archived memory_ingestion messages`)
      // Archive messages need special handling - they're in pgmq schema
    } else {
      console.log('✅ No archived memory_ingestion messages')
    }
  } catch (e) {
    console.log('- pgmq archive not accessible or empty')
  }
  
  console.log('\n✅ Audit complete!')
}

auditChunkIds().catch(console.error)