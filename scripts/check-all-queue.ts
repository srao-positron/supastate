import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

async function checkAllQueue() {
  // Count by status
  const { data: statusCounts, error: countError } = await supabase
    .from('code_processing_queue')
    .select('status')
    
  if (countError) {
    console.error('Error fetching counts:', countError)
    return
  }
  
  const counts = statusCounts?.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  
  console.log('Queue Status Counts:')
  console.table(counts)
  console.log('Total files in queue:', statusCounts?.length || 0)
  
  // Check recent entries
  const { data: recent, error: recentError } = await supabase
    .from('code_processing_queue')
    .select('file_path, status, task_id, created_at')
    .order('created_at', { ascending: false })
    .limit(10)
    
  if (!recentError && recent) {
    console.log('\nMost recent queue entries:')
    console.table(recent.map(r => ({
      file: r.file_path,
      status: r.status,
      task_id: r.task_id,
      created: new Date(r.created_at).toLocaleString()
    })))
  }
  
  // Check unique task IDs
  const { data: taskIds, error: taskError } = await supabase
    .from('code_processing_queue')
    .select('task_id')
    .not('task_id', 'is', null)
    
  if (!taskError && taskIds) {
    const uniqueTasks = [...new Set(taskIds.map(t => t.task_id))]
    console.log('\nUnique task IDs:', uniqueTasks.length)
    console.log('Task IDs:', uniqueTasks)
  }
}

checkAllQueue()