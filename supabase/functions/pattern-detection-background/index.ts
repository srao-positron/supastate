import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Main handler that triggers background processing
serve(async (req, connInfo) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { operation = 'process-all' } = await req.json().catch(() => ({}))
    
    // Verify authorization
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.includes(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    const runtime = connInfo as any
    
    // Use waitUntil to run processing in background
    if (runtime?.waitUntil) {
      switch (operation) {
        case 'create-summaries':
          runtime.waitUntil(processSummariesInBackground())
          break
          
        case 'detect-patterns':
          runtime.waitUntil(detectPatternsInBackground())
          break
          
        case 'process-all':
        default:
          // Process everything in sequence
          runtime.waitUntil(processEverythingInBackground())
          break
      }
      
      return new Response(
        JSON.stringify({ 
          message: `Background ${operation} started`,
          timestamp: new Date().toISOString()
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } else {
      // Fallback: trigger separate functions
      const baseUrl = Deno.env.get('SUPABASE_URL')
      const authToken = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      
      // Queue the work
      fetch(`${baseUrl}/functions/v1/smart-pattern-detection`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ operation })
      }).catch(err => console.error('Failed to queue work:', err))
      
      return new Response(
        JSON.stringify({ 
          message: `${operation} queued`,
          timestamp: new Date().toISOString()
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
  } catch (error) {
    console.error('Background task error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

// Background processing functions
async function processEverythingInBackground() {
  console.log('Starting background processing of all data...')
  
  const baseUrl = Deno.env.get('SUPABASE_URL')
  const authToken = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  
  try {
    // Step 1: Create summaries for existing data
    console.log('Step 1: Creating summaries...')
    const summaryResponse = await fetch(`${baseUrl}/functions/v1/smart-pattern-detection`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ operation: 'create-summaries' })
    })
    
    const summaryResult = await summaryResponse.json()
    console.log('Summary creation result:', summaryResult)
    
    // Wait a bit between operations
    await new Promise(resolve => setTimeout(resolve, 5000))
    
    // Step 2: Detect patterns
    console.log('Step 2: Detecting patterns...')
    const patternResponse = await fetch(`${baseUrl}/functions/v1/smart-pattern-detection`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ operation: 'detect-patterns' })
    })
    
    const patternResult = await patternResponse.json()
    console.log('Pattern detection result:', patternResult)
    
    // Step 3: Log completion
    console.log('Background processing completed', {
      summaries: summaryResult,
      patterns: patternResult,
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('Background processing failed:', error)
  }
}

async function processSummariesInBackground() {
  console.log('Starting background summary creation...')
  
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
  
  try {
    // Process in batches
    let processed = 0
    let hasMore = true
    
    while (hasMore) {
      const response = await fetch(
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/smart-pattern-detection`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ 
            operation: 'create-summaries',
            batchSize: 100
          })
        }
      )
      
      const result = await response.json()
      processed += result.processed?.memories || 0
      processed += result.processed?.code || 0
      
      // Check if there's more to process
      hasMore = (result.processed?.memories || 0) > 0 || (result.processed?.code || 0) > 0
      
      console.log(`Processed batch: ${result.processed?.memories || 0} memories, ${result.processed?.code || 0} code entities`)
      
      // Wait between batches to avoid overload
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }
    
    console.log(`Summary creation completed. Total processed: ${processed}`)
    
  } catch (error) {
    console.error('Summary background processing failed:', error)
  }
}

async function detectPatternsInBackground() {
  console.log('Starting background pattern detection...')
  
  try {
    // Run pattern detection multiple times for different time windows
    const timeWindows = ['hour', 'day', 'week', 'all']
    
    for (const window of timeWindows) {
      console.log(`Detecting patterns for time window: ${window}`)
      
      const response = await fetch(
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/smart-pattern-detection`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ 
            operation: 'detect-patterns',
            timeWindow: window
          })
        }
      )
      
      const result = await response.json()
      console.log(`Patterns detected for ${window}:`, result.patternCount || 0)
      
      // Wait between windows
      await new Promise(resolve => setTimeout(resolve, 3000))
    }
    
    console.log('Pattern detection completed for all time windows')
    
  } catch (error) {
    console.error('Pattern detection background processing failed:', error)
  }
}