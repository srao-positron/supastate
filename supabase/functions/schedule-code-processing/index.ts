import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req, connInfo) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // First check if there are any pending tasks that haven't been started
    const { data: pendingTasks } = await supabase
      .from('code_processing_tasks')
      .select('id')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)

    if (pendingTasks && pendingTasks.length > 0) {
      // Process existing pending task
      const taskId = pendingTasks[0].id
      
      // Check how many items are assigned to this task
      const { count: itemCount } = await supabase
        .from('code_processing_queue')
        .select('*', { count: 'exact', head: true })
        .eq('task_id', taskId)
        .eq('status', 'pending')

      // Invoke the process-code function for this existing task as a background task
      const runtime = connInfo as any
      const invokePromise = fetch(`${supabaseUrl}/functions/v1/process-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ taskId: taskId })
      }).catch(err => {
        console.error('Failed to invoke process-code:', err)
      })
      
      if (runtime?.waitUntil) {
        runtime.waitUntil(invokePromise)
      }

      const data = { message: 'Process-code invoked in background' }

      return new Response(
        JSON.stringify({ 
          success: true,
          taskId: taskId,
          itemsAssigned: itemCount || 0,
          processCodeResponse: data,
          message: `Started processing existing task with ${itemCount || 0} items`
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }

    // Check if there are pending items without a task
    const { count: pendingCount } = await supabase
      .from('code_processing_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .is('task_id', null)

    if (!pendingCount || pendingCount === 0) {
      return new Response(
        JSON.stringify({ 
          message: 'No pending items to process',
          pendingCount: 0 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }

    // Create a new task
    const taskId = crypto.randomUUID()
    const { error: taskError } = await supabase
      .from('code_processing_tasks')
      .insert({
        id: taskId,
        status: 'pending',
        created_at: new Date().toISOString()
      })

    if (taskError) {
      throw new Error(`Failed to create task: ${taskError.message}`)
    }

    // Assign pending items to this task (limit to 100)
    const { data: itemsToProcess } = await supabase
      .from('code_processing_queue')
      .select('id')
      .eq('status', 'pending')
      .is('task_id', null)
      .order('created_at', { ascending: true })
      .limit(100)

    if (itemsToProcess && itemsToProcess.length > 0) {
      const itemIds = itemsToProcess.map(item => item.id)
      
      const { error: updateError } = await supabase
        .from('code_processing_queue')
        .update({ task_id: taskId })
        .in('id', itemIds)

      if (updateError) {
        throw new Error(`Failed to assign items to task: ${updateError.message}`)
      }
    }

    // Invoke the process-code function as a background task
    const runtime = connInfo as any
    const invokePromise = fetch(`${supabaseUrl}/functions/v1/process-code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({ taskId: taskId })
    }).catch(err => {
      console.error('Failed to invoke process-code:', err)
    })
    
    if (runtime?.waitUntil) {
      runtime.waitUntil(invokePromise)
    }

    const data = { message: 'Process-code invoked in background' }

    return new Response(
      JSON.stringify({ 
        success: true,
        taskId: taskId,
        itemsAssigned: itemsToProcess?.length || 0,
        processCodeResponse: data,
        message: `Started processing ${itemsToProcess?.length || 0} items`
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )
  } catch (error) {
    console.error('Error in schedule-code-processing:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})