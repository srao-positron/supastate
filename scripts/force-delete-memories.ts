#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

async function forceDeleteMemories() {
  console.log('=== FORCE DELETE ALL MEMORIES ===\n')
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  // Check current state
  const { count: beforeCount } = await supabase
    .from('memories')
    .select('*', { count: 'exact', head: true })
    
  console.log(`Memories before deletion: ${beforeCount}`)
  
  if (beforeCount > 0) {
    // Delete ALL memories - try different approaches
    console.log('\nAttempting deletion...')
    
    // Method 1: Simple delete all
    const { error: error1, count: count1 } = await supabase
      .from('memories')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')
      
    if (error1) {
      console.log('Method 1 failed:', error1.message)
      
      // Method 2: Delete without condition
      const { error: error2 } = await supabase
        .from('memories')
        .delete()
        .gte('created_at', '2000-01-01')
        
      if (error2) {
        console.log('Method 2 failed:', error2.message)
        
        // Method 3: Delete in batches
        console.log('Trying batch deletion...')
        let deleted = 0
        
        while (true) {
          const { data: batch } = await supabase
            .from('memories')
            .select('id')
            .limit(100)
            
          if (!batch || batch.length === 0) break
          
          for (const record of batch) {
            await supabase
              .from('memories')
              .delete()
              .eq('id', record.id)
            deleted++
          }
          
          console.log(`Deleted ${deleted} records so far...`)
        }
      }
    }
  }
  
  // Verify deletion
  const { count: afterCount } = await supabase
    .from('memories')
    .select('*', { count: 'exact', head: true })
    
  console.log(`\nMemories after deletion: ${afterCount}`)
  
  if (afterCount === 0) {
    console.log('✅ All memories successfully deleted!')
  } else {
    console.log('❌ Failed to delete all memories')
    
    // Show what's left
    const { data: remaining } = await supabase
      .from('memories')
      .select('id, chunk_id, created_at')
      .limit(5)
      
    if (remaining) {
      console.log('\nSample of remaining memories:')
      for (const mem of remaining) {
        console.log(`- ${mem.chunk_id} (${new Date(mem.created_at).toLocaleTimeString()})`)
      }
    }
  }
}

forceDeleteMemories().catch(console.error)