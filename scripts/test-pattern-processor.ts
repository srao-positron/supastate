#!/usr/bin/env npx tsx

/**
 * Test the pattern processor function
 */

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

async function testPatternProcessor() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  
  const supabase = createClient(supabaseUrl, supabaseKey)
  
  console.log('\n=== Testing Pattern Processor ===')
  
  try {
    const { data, error } = await supabase.functions.invoke('pattern-processor', {
      body: { trigger: 'manual' }
    })
    
    if (error) {
      console.error('Error:', error)
      return
    }
    
    console.log('\nResults:', JSON.stringify(data, null, 2))
    
    // Summary
    if (data?.processed) {
      console.log('\n=== Summary ===')
      console.log(`Memories processed: ${data.processed.memories || 0}`)
      console.log(`Patterns discovered: ${data.patternCount || 0}`)
      console.log(`Processing time: ${data.processingTime}ms`)
      console.log(`Batch ID: ${data.batchId}`)
      
      if (data.patterns && data.patterns.length > 0) {
        console.log('\n=== New Patterns ===')
        data.patterns.forEach((pattern: any, idx: number) => {
          console.log(`${idx + 1}. ${pattern.type} - ${pattern.pattern}`)
          console.log(`   Confidence: ${pattern.confidence}`)
          console.log(`   Frequency: ${pattern.frequency}`)
        })
      }
    }
    
  } catch (err) {
    console.error('Unexpected error:', err)
  }
}

testPatternProcessor().catch(console.error)