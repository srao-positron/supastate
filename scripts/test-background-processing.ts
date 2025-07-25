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

async function testBackgroundProcessing() {
  console.log('Testing improved background processing...')
  
  // Check current queue status
  const { data: beforeCounts } = await supabase
    .from('memory_queue')
    .select('status')
    
  if (beforeCounts) {
    const statusCounts = beforeCounts.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    
    console.log('\nQueue status before processing:')
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`)
    })
  }
  
  // Invoke the process-embeddings function
  console.log('\nInvoking process-embeddings function...')
  const { data, error } = await supabase.functions.invoke('process-embeddings', {
    body: {}
  })
  
  if (error) {
    console.error('Error invoking function:', error)
  } else {
    console.log('Function response:', data)
  }
  
  // Monitor progress for a bit
  console.log('\nMonitoring progress...')
  for (let i = 0; i < 10; i++) {
    await new Promise(resolve => setTimeout(resolve, 5000)) // Wait 5 seconds
    
    const { data: counts } = await supabase
      .from('memory_queue')
      .select('status')
      
    if (counts) {
      const statusCounts = counts.reduce((acc, item) => {
        acc[item.status] = (acc[item.status] || 0) + 1
        return acc
      }, {} as Record<string, number>)
      
      console.log(`\n[${new Date().toISOString()}] Queue status:`)
      Object.entries(statusCounts).forEach(([status, count]) => {
        console.log(`  ${status}: ${count}`)
      })
      
      // If all are completed, stop monitoring
      if (!statusCounts.pending && !statusCounts.processing) {
        console.log('\nAll items processed!')
        break
      }
    }
  }
}

testBackgroundProcessing().catch(console.error)