import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

// This function is called by cron to process the code_dedupe queue
serve(async (req) => {
  try {
    // Call the code-dedupe function to process messages
    const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/code-dedupe`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    })

    const result = await response.json()
    
    console.log('[Process Code Dedupe] Result:', result)

    return new Response(
      JSON.stringify(result),
      { 
        headers: { 'Content-Type': 'application/json' },
        status: 200
      }
    )
  } catch (error) {
    console.error('[Process Code Dedupe] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})