#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

async function clearCodeQueue() {
  console.log('=== CLEAR CODE QUEUE TABLE ===\n')
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  // Check code_queue table
  const { count, data } = await supabase
    .from('code_queue')
    .select('*', { count: 'exact' })
    .limit(5)
    
  console.log(`Code queue items: ${count}`)
  
  if (data && data.length > 0) {
    console.log('\nSample items:')
    for (const item of data) {
      console.log(`- ID: ${item.id}, Created: ${new Date(item.created_at).toLocaleString()}`)
      if (item.file_path) {
        console.log(`  File: ${item.file_path}`)
      }
    }
  }
  
  if (count > 0) {
    // Clear the table
    console.log('\nClearing code_queue table...')
    const { error } = await supabase
      .from('code_queue')
      .delete()
      .gte('created_at', '2000-01-01')
      
    if (error) {
      console.log('Error with first method:', error.message)
      
      // Try alternative method
      const { error: error2 } = await supabase
        .from('code_queue')
        .delete()
        .not('id', 'is', null)
        
      if (error2) {
        console.log('Error with second method:', error2.message)
      }
    }
    
    // Verify
    const { count: afterCount } = await supabase
      .from('code_queue')
      .select('*', { count: 'exact', head: true })
      
    console.log(`\nCode queue items after delete: ${afterCount}`)
    
    if (afterCount === 0) {
      console.log('✅ Code queue successfully cleared!')
    } else {
      console.log('❌ Some items remain in code queue')
    }
  } else {
    console.log('✅ Code queue is already empty')
  }
}

clearCodeQueue().catch(console.error)