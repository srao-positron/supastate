#!/usr/bin/env npx tsx

/**
 * Test the smart pattern detection edge function
 */

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

async function testPatternDetection() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  
  const supabase = createClient(supabaseUrl, supabaseKey)
  
  // First test the debug function
  console.log('\n=== Testing Debug Function ===')
  const { data: debugData, error: debugError } = await supabase.functions.invoke('debug-neo4j', {
    body: {}
  })
  
  if (debugError) {
    console.error('Debug error:', debugError)
  } else {
    console.log('Debug results:', JSON.stringify(debugData, null, 2))
  }
  
  console.log('\n=== Testing Smart Pattern Detection ===')
  console.log('Function URL:', `${supabaseUrl}/functions/v1/smart-pattern-detection`)
  
  try {
    // Test the function
    const { data, error } = await supabase.functions.invoke('smart-pattern-detection', {
      body: {
        operation: 'all',
        limit: 10
      }
    })
    
    if (error) {
      console.error('Error:', error)
      // Try to get error details from response
      if (error.context?.body) {
        try {
          const errorText = await error.context.text()
          console.error('Error details:', errorText)
        } catch (e) {
          console.error('Could not read error body')
        }
      }
      return
    }
    
    console.log('\nResults:', JSON.stringify(data, null, 2))
    
    // Summary
    if (data?.processed) {
      console.log('\n=== Summary ===')
      console.log(`Memories processed: ${data.processed.memories || 0}`)
      console.log(`Code entities processed: ${data.processed.code || 0}`)
      console.log(`Patterns found: ${data.patternCount || 0}`)
      console.log(`Processing time: ${data.processingTime}ms`)
    }
    
    // Test just pattern detection if we have summaries
    if ((data?.processed?.memories || 0) + (data?.processed?.code || 0) === 0) {
      console.log('\nNo new summaries created, testing pattern detection only...')
      
      const { data: patternData, error: patternError } = await supabase.functions.invoke('smart-pattern-detection', {
        body: {
          operation: 'patterns',
          limit: 100
        }
      })
      
      if (patternError) {
        console.error('Pattern error:', patternError)
      } else {
        console.log('\nPattern Results:', JSON.stringify(patternData, null, 2))
      }
    }
    
  } catch (err) {
    console.error('Unexpected error:', err)
  }
}

testPatternDetection().catch(console.error)