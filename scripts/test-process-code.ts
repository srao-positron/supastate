import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

async function testProcessCode() {
  // Get the task that's stuck
  const { data: task, error } = await supabase
    .from('code_processing_tasks')
    .select('*')
    .eq('status', 'processing')
    .single()
    
  if (error || !task) {
    console.error('No task to test with', error)
    return
  }
  
  console.log('Testing with task:', task.id)
  
  // Update to use the new test task
  const taskId = 'de26cefd-ce8f-455c-ab54-c518a68305e2'
  
  // Try to process it directly
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/process-code`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ taskId })
    }
  )
  
  console.log('Response status:', response.status)
  const text = await response.text()
  console.log('Response body:', text)
  
  // Try parsing as JSON if possible
  try {
    const json = JSON.parse(text)
    console.log('Parsed response:', JSON.stringify(json, null, 2))
  } catch (e) {
    // Not JSON
  }
}

testProcessCode()