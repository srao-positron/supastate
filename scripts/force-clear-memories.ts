#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

async function forceClearMemories() {
  console.log('=== FORCE CLEAR MEMORIES TABLE ===\n')
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  // Check current state
  const { count: beforeCount } = await supabase
    .from('memories')
    .select('*', { count: 'exact', head: true })
    
  console.log(`Memories before deletion: ${beforeCount}`)
  
  // Check for the specific chunk mentioned in the error
  const { data: existing } = await supabase
    .from('memories')
    .select('id, chunk_id, created_at, workspace_id')
    .eq('chunk_id', 'e04a12d8-f1cd-4ec6-839d-726ee309948d-chunk-27')
    
  if (existing && existing.length > 0) {
    console.log('\nFound existing memory with chunk ID e04a12d8-f1cd-4ec6-839d-726ee309948d-chunk-27:')
    console.log(existing)
  }
  
  // Show a sample of what's in the table
  const { data: sample } = await supabase
    .from('memories')
    .select('id, chunk_id, workspace_id, created_at')
    .limit(10)
    
  if (sample && sample.length > 0) {
    console.log('\nSample of memories in table:')
    for (const mem of sample) {
      console.log(`- ${mem.chunk_id} (workspace: ${mem.workspace_id || 'null'}), created: ${new Date(mem.created_at).toLocaleString()}`)
    }
  }
  
  if (beforeCount > 0) {
    console.log('\nAttempting multiple deletion methods...')
    
    // Method 1: Delete with NOT NULL condition
    console.log('\nMethod 1: Delete where id is not null...')
    const { error: error1 } = await supabase
      .from('memories')
      .delete()
      .not('id', 'is', null)
      
    if (error1) {
      console.log('Method 1 failed:', error1.message)
      
      // Method 2: Delete with created_at condition
      console.log('\nMethod 2: Delete where created_at >= 2000...')
      const { error: error2 } = await supabase
        .from('memories')
        .delete()
        .gte('created_at', '2000-01-01')
        
      if (error2) {
        console.log('Method 2 failed:', error2.message)
        
        // Method 3: Delete in smaller batches
        console.log('\nMethod 3: Delete in batches...')
        let totalDeleted = 0
        let hasMore = true
        
        while (hasMore) {
          // Get a batch of IDs
          const { data: batch } = await supabase
            .from('memories')
            .select('id')
            .limit(100)
            
          if (!batch || batch.length === 0) {
            hasMore = false
            break
          }
          
          // Delete this batch
          for (const record of batch) {
            const { error: delError } = await supabase
              .from('memories')
              .delete()
              .eq('id', record.id)
              
            if (!delError) {
              totalDeleted++
            }
          }
          
          console.log(`Deleted ${totalDeleted} records so far...`)
        }
        
        console.log(`Total deleted via batch method: ${totalDeleted}`)
      }
    }
  }
  
  // Final verification
  const { count: afterCount } = await supabase
    .from('memories')
    .select('*', { count: 'exact', head: true })
    
  console.log(`\nMemories after deletion attempts: ${afterCount}`)
  
  if (afterCount === 0) {
    console.log('✅ All memories successfully deleted!')
  } else {
    console.log('❌ Some memories still remain!')
    console.log('\nTry running this SQL directly in Supabase SQL Editor:')
    console.log('DELETE FROM memories;')
    console.log('-- or if that fails:')
    console.log('TRUNCATE TABLE memories RESTART IDENTITY CASCADE;')
    
    // Check for any constraints
    console.log('\nTo check constraints, run this SQL:')
    console.log(`
SELECT 
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
LEFT JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_name = 'memories'
ORDER BY tc.constraint_type;
`)
  }
}

forceClearMemories().catch(console.error)