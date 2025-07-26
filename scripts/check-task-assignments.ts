import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

async function checkTaskAssignments() {
  console.log('Checking task assignments...\n')

  // Check tasks with their assigned item counts
  const { data: tasks } = await supabase
    .from('code_processing_tasks')
    .select('id, status, created_at')
    .order('created_at', { ascending: false })
    .limit(10)

  if (tasks) {
    for (const task of tasks) {
      const { count } = await supabase
        .from('code_processing_queue')
        .select('*', { count: 'exact', head: true })
        .eq('task_id', task.id)

      console.log(`Task ${task.id}:`)
      console.log(`  Status: ${task.status}`)
      console.log(`  Created: ${new Date(task.created_at).toLocaleString()}`)
      console.log(`  Assigned items: ${count || 0}`)
    }
  }

  // Check for unassigned items
  const { count: unassignedCount } = await supabase
    .from('code_processing_queue')
    .select('*', { count: 'exact', head: true })
    .is('task_id', null)
    .eq('status', 'pending')

  console.log(`\nUnassigned pending items: ${unassignedCount}`)

  // Check a sample of queue items to see their task assignments
  const { data: sampleItems } = await supabase
    .from('code_processing_queue')
    .select('id, file_path, task_id, status')
    .eq('status', 'pending')
    .limit(5)

  console.log('\nSample queue items:')
  sampleItems?.forEach(item => {
    console.log(`- ${item.file_path}`)
    console.log(`  Task ID: ${item.task_id || 'NOT ASSIGNED'}`)
    console.log(`  Status: ${item.status}`)
  })
}

checkTaskAssignments().then(() => {
  console.log('\nDone!')
  process.exit(0)
}).catch(err => {
  console.error('Error:', err)
  process.exit(1)
})