import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = `https://${process.env.SUPABASE_PROJECT_ID}.supabase.co`
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function triggerAllPendingProcessing() {
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false
    }
  })

  console.log('📊 Starting batch processing for all pending code files...\n')

  // Get summary of all pending items by task
  const { data: taskSummary } = await supabase
    .from('code_processing_queue')
    .select('task_id')
    .eq('status', 'pending')
    
  if (!taskSummary || taskSummary.length === 0) {
    console.log('✅ No pending items to process')
    return
  }

  const taskCounts = taskSummary.reduce((acc, item) => {
    acc[item.task_id] = (acc[item.task_id] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  console.log('Pending items by task:')
  const sortedTasks = Object.entries(taskCounts)
    .sort(([, a], [, b]) => b - a)
  
  sortedTasks.forEach(([taskId, count]) => {
    console.log(`  ${taskId}: ${count} items`)
  })

  const totalPending = Object.values(taskCounts).reduce((sum, count) => sum + count, 0)
  console.log(`\nTotal pending items: ${totalPending}`)

  // Process each task
  for (const [taskId, count] of sortedTasks) {
    console.log(`\n🚀 Triggering processing for task: ${taskId} (${count} items)`)
    
    try {
      const response = await fetch(
        `https://${process.env.SUPABASE_PROJECT_ID}.supabase.co/functions/v1/process-code`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ taskId })
        }
      )

      if (response.ok) {
        const result = await response.json()
        console.log(`✅ Processing triggered successfully:`, result.message)
      } else {
        console.error(`❌ Failed to trigger processing:`, await response.text())
      }

      // Wait a bit between triggers to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 2000))
    } catch (error) {
      console.error(`❌ Error triggering task ${taskId}:`, error)
    }
  }

  // Check final status after all triggers
  console.log('\n📈 Final status check:')
  const { data: finalStats } = await supabase
    .from('code_processing_queue')
    .select('status')
    
  if (finalStats) {
    const statusCounts = finalStats.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`)
    })
  }

  console.log('\n💡 Note: Processing is running in the background.')
  console.log('Check Neo4j entity count with: npm run script scripts/check-neo4j-code-entities.ts')
}

triggerAllPendingProcessing().then(() => {
  console.log('\nDone triggering all tasks!')
  process.exit(0)
}).catch(err => {
  console.error('Error:', err)
  process.exit(1)
})