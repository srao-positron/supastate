import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

async function resetStuckProcessing() {
  console.log('Resetting stuck processing items...')
  
  // Reset stuck queue items
  const { data: resetQueue, error: queueError } = await supabase
    .from('code_processing_queue')
    .update({ status: 'pending' })
    .eq('status', 'processing')
    .select()
    
  if (queueError) {
    console.error('Error resetting queue:', queueError)
  } else {
    console.log(`Reset ${resetQueue?.length || 0} queue items to pending`)
  }
  
  // Reset stuck tasks
  const { data: resetTasks, error: taskError } = await supabase
    .from('code_processing_tasks')
    .update({ 
      status: 'pending',
      started_at: null 
    })
    .eq('status', 'processing')
    .select()
    
  if (taskError) {
    console.error('Error resetting tasks:', taskError)
  } else {
    console.log(`Reset ${resetTasks?.length || 0} tasks to pending`)
  }
  
  // Trigger processing again
  if (resetTasks && resetTasks.length > 0) {
    for (const task of resetTasks) {
      console.log(`Triggering process-code for task ${task.id}`)
      
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/process-code`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ taskId: task.id })
          }
        )
        
        if (!response.ok) {
          console.error(`Failed to trigger processing: ${response.status} ${response.statusText}`)
          const text = await response.text()
          console.error('Response:', text)
        } else {
          console.log('Processing triggered successfully')
        }
      } catch (error) {
        console.error('Error triggering processing:', error)
      }
    }
  }
}

resetStuckProcessing()