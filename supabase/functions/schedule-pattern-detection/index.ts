import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// This function is designed to be called by pg_cron or external schedulers
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify the request is from an authorized source
    const authHeader = req.headers.get('Authorization')
    const expectedToken = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!authHeader || !authHeader.includes(expectedToken)) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

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

    // Check if pattern detection is already running
    const { data: runningJobs } = await supabase
      .from('pattern_detection_queue')
      .select('count')
      .eq('status', 'processing')
      .single()

    if (runningJobs?.count > 10) {
      console.log('Pattern detection already running with', runningJobs.count, 'items')
      return new Response(
        JSON.stringify({ 
          message: 'Pattern detection already in progress',
          processing: runningJobs.count 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Trigger pattern detection for different time windows
    const jobs = []

    // 1. Real-time patterns (last 15 minutes)
    jobs.push(
      fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/detect-patterns-batch`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          window: 'realtime',
          minutes: 15 
        })
      })
    )

    // 2. Hourly patterns
    const currentMinute = new Date().getMinutes()
    if (currentMinute < 5) { // Run in first 5 minutes of each hour
      jobs.push(
        fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/detect-patterns-batch`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            window: 'hourly',
            hours: 1 
          })
        })
      )
    }

    // 3. Daily patterns (run at 2 AM)
    const currentHour = new Date().getHours()
    if (currentHour === 2 && currentMinute < 5) {
      jobs.push(
        fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/detect-patterns-batch`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            window: 'daily',
            days: 1 
          })
        })
      )

      // Also run pattern evolution tracking
      jobs.push(
        fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/evolve-patterns`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json',
          }
        })
      )
    }

    // 4. Clean up old queue items (daily at 3 AM)
    if (currentHour === 3 && currentMinute < 5) {
      await supabase.rpc('clean_pattern_queue')
      
      // Archive old patterns
      await supabase
        .from('discovered_patterns')
        .update({ 
          stability: 0,
          metadata: supabase.sql`metadata || '{"archived": true}'::jsonb`
        })
        .lt('last_validated', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .lt('confidence', 0.3)
    }

    // Execute all jobs
    const results = await Promise.allSettled(jobs)
    
    const successful = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length

    console.log(`Scheduled pattern detection: ${successful} successful, ${failed} failed`)

    return new Response(
      JSON.stringify({
        success: true,
        jobs: {
          triggered: jobs.length,
          successful,
          failed
        },
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Schedule error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})