import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = `https://${process.env.SUPABASE_PROJECT_ID}.supabase.co`
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function checkAndTriggerProcessing() {
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false
    }
  })

  console.log('📊 Checking processing status...\n')

  // Check pending code items
  const { data: pendingCode, error } = await supabase
    .from('code_processing_queue')
    .select('*')
    .eq('status', 'pending')
    .limit(1)

  if (error) {
    console.error('Error checking pending code:', error)
    return
  }

  // Get summary of pending items by task
  const { data: taskSummary } = await supabase
    .from('code_processing_queue')
    .select('task_id')
    .eq('status', 'pending')
    
  if (taskSummary) {
    const taskCounts = taskSummary.reduce((acc, item) => {
      acc[item.task_id] = (acc[item.task_id] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    console.log('Pending items by task:')
    Object.entries(taskCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .forEach(([taskId, count]) => {
        console.log(`  ${taskId}: ${count} items`)
      })
  }

  // Trigger processing for top task
  const { data: topTask } = await supabase
    .from('code_processing_queue')
    .select('task_id')
    .eq('status', 'pending')
    .limit(1)
    .single()

  if (topTask) {
    console.log(`\n🚀 Triggering processing for task: ${topTask.task_id}`)
    
    const response = await fetch(
      `https://${process.env.SUPABASE_PROJECT_ID}.supabase.co/functions/v1/process-code`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ taskId: topTask.task_id })
      }
    )

    if (response.ok) {
      console.log('✅ Processing triggered successfully')
    } else {
      console.error('❌ Failed to trigger processing:', await response.text())
    }
  } else {
    console.log('\n✅ No pending items to process')
  }

  // Check how many CodeEntity nodes exist
  console.log('\n📈 Current status:')
  const { data: stats } = await supabase
    .from('code_processing_queue')
    .select('status')
    
  if (stats) {
    const statusCounts = stats.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`)
    })
  }
}

checkAndTriggerProcessing().then(() => {
  console.log('\nDone!')
  process.exit(0)
}).catch(err => {
  console.error('Error:', err)
  process.exit(1)
})