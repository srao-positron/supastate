#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function resetProcessingQueue() {
  console.log('Resetting stuck processing items back to pending...')
  
  // Reset items that have been in processing for more than 10 minutes
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  
  const { data, error } = await supabase
    .from('memory_queue')
    .update({ 
      status: 'pending',
      retry_count: 0 // Reset retry count
    })
    .eq('status', 'processing')
    .lt('updated_at', tenMinutesAgo)
    
  if (error) {
    console.error('Error resetting queue:', error)
  } else {
    console.log('Reset old processing items')
  }
  
  // Also reset ALL processing items (since we're improving the processor)
  const { data: allData, error: allError } = await supabase
    .from('memory_queue')
    .update({ 
      status: 'pending'
    })
    .eq('status', 'processing')
    
  if (allError) {
    console.error('Error resetting all processing items:', error)
  } else {
    console.log('Reset all processing items to pending')
  }
  
  // Get updated counts
  const { data: counts } = await supabase
    .from('memory_queue')
    .select('status')
    
  if (counts) {
    const statusCounts = counts.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    
    console.log('\nUpdated queue status:')
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`)
    })
  }
}

resetProcessingQueue().catch(console.error)