import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

async function checkCodeProcessingStatus() {
  console.log('Checking code processing status...\n')

  // Check recent processing tasks
  const { data: tasks, error: tasksError } = await supabase
    .from('code_processing_tasks')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5)

  if (tasksError) {
    console.error('Error fetching tasks:', tasksError)
  } else {
    console.log('Recent processing tasks:')
    tasks?.forEach(task => {
      console.log(`- Task ${task.id}: ${task.status} (created: ${new Date(task.created_at).toLocaleString()})`)
      if (task.error) {
        console.log(`  Error: ${task.error}`)
      }
      if (task.metadata) {
        console.log(`  Metadata: ${JSON.stringify(task.metadata)}`)
      }
    })
  }

  // Check for any errors in recent queue items
  const { data: errorItems, error: queueError } = await supabase
    .from('code_processing_queue')
    .select('*')
    .not('error', 'is', null)
    .order('created_at', { ascending: false })
    .limit(10)

  if (queueError) {
    console.error('\nError fetching queue errors:', queueError)
  } else if (errorItems && errorItems.length > 0) {
    console.log('\n\nRecent processing errors:')
    errorItems.forEach(item => {
      console.log(`\n- File: ${item.file_path}`)
      console.log(`  Status: ${item.status}`)
      console.log(`  Error: ${item.error}`)
      console.log(`  Task ID: ${item.task_id}`)
    })
  } else {
    console.log('\n\nNo recent processing errors found.')
  }

  // Check total counts
  const { count: pendingCount } = await supabase
    .from('code_processing_queue')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')

  const { count: processingCount } = await supabase
    .from('code_processing_queue')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'processing')

  const { count: completedCount } = await supabase
    .from('code_processing_queue')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'completed')

  const { count: failedCount } = await supabase
    .from('code_processing_queue')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'failed')

  console.log('\n\nQueue status summary:')
  console.log(`- Pending: ${pendingCount}`)
  console.log(`- Processing: ${processingCount}`)
  console.log(`- Completed: ${completedCount}`)
  console.log(`- Failed: ${failedCount}`)

  // Check for any recent successful completions
  const { data: recentCompleted } = await supabase
    .from('code_processing_queue')
    .select('file_path, processed_at')
    .eq('status', 'completed')
    .order('processed_at', { ascending: false })
    .limit(5)

  if (recentCompleted && recentCompleted.length > 0) {
    console.log('\n\nRecently completed files:')
    recentCompleted.forEach(item => {
      console.log(`- ${item.file_path} (${new Date(item.processed_at).toLocaleString()})`)
    })
  }
}

checkCodeProcessingStatus().then(() => {
  console.log('\nDone!')
  process.exit(0)
}).catch(err => {
  console.error('Error:', err)
  process.exit(1)
})