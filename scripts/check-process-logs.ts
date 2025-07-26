import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

async function checkLogs() {
  // Check processing queue status
  const { data: queue, error: queueError } = await supabase
    .from('code_processing_queue')
    .select('*')
    .in('status', ['processing', 'failed'])
    .order('created_at', { ascending: false })
    
  if (queueError) {
    console.error('Error fetching queue:', queueError)
    return
  }
  
  console.log('Code Processing Queue:')
  console.table(queue?.map(item => ({
    file: item.file_path,
    status: item.status,
    error: item.error,
    created: new Date(item.created_at).toLocaleString(),
    processed: item.processed_at ? new Date(item.processed_at).toLocaleString() : 'N/A'
  })))

  // Check task status
  const { data: tasks, error: taskError } = await supabase
    .from('code_processing_tasks')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5)
    
  if (taskError) {
    console.error('Error fetching tasks:', taskError)
    return
  }
  
  console.log('\nProcessing Tasks:')
  console.table(tasks?.map(task => ({
    id: task.id,
    status: task.status,
    files_count: task.files_count,
    created: new Date(task.created_at).toLocaleString(),
    started: task.started_at ? new Date(task.started_at).toLocaleString() : 'N/A',
    completed: task.completed_at ? new Date(task.completed_at).toLocaleString() : 'N/A'
  })))
}

checkLogs()