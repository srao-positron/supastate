import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

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
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Parse request body
    const { pattern_types, limit, batch_id } = await req.json()

    // Queue the pattern detection job
    const { data: msgId, error } = await supabase.rpc('queue_pattern_detection_job', {
      p_batch_id: batch_id || crypto.randomUUID(),
      p_pattern_types: pattern_types || ['debugging', 'learning', 'refactoring', 'temporal', 'semantic', 'memory_code'],
      p_limit: limit || 100
    })

    if (error) {
      throw new Error(`Failed to queue job: ${error.message}`)
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        msg_id: msgId,
        message: 'Pattern detection job queued successfully'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error('Queue error:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: error.stack 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})