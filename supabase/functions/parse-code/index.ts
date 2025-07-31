import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse request body
    const { code, language, filename } = await req.json()

    if (!code || !language) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: code and language' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      )
    }

    // Get Lambda Function URL from environment
    const LAMBDA_FUNCTION_URL = Deno.env.get('LAMBDA_FUNCTION_URL')
    
    if (!LAMBDA_FUNCTION_URL) {
      console.error('LAMBDA_FUNCTION_URL not configured')
      
      // For now, return a mock response to avoid errors
      // This should be replaced with actual Lambda invocation once Function URL is configured
      const mockResponse = {
        success: true,
        parsed: {
          imports: [],
          exports: [],
          classes: [],
          functions: [],
          variables: [],
          dependencies: []
        },
        message: 'Mock response - Lambda Function URL not configured'
      }
      
      return new Response(
        JSON.stringify(mockResponse),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      )
    }
    
    // Invoke Lambda via Function URL
    console.log('Invoking Lambda function via Function URL...')
    const response = await fetch(LAMBDA_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code,
        language,
        filename: filename || ''
      })
    })
    
    console.log('Lambda response status:', response.status)
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('Lambda invocation failed:', errorText)
      return new Response(
        JSON.stringify({ 
          error: 'Lambda invocation failed',
          details: errorText
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        }
      )
    }
    
    const result = await response.json()
    
    // Return parsed results
    return new Response(
      JSON.stringify(result),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message,
        stack: error.stack 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})