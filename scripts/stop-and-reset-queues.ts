import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = `https://${process.env.SUPABASE_PROJECT_ID}.supabase.co`
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function stopAndResetQueues() {
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false
    }
  })

  console.log('🛑 Stopping and resetting queues...\n')

  // 1. Mark all processing items as failed to stop them
  console.log('1. Marking processing items as failed...')
  
  const { error: memError } = await supabase
    .from('memory_queue')
    .update({ 
      status: 'failed',
      error: 'Stopped by admin for fixes',
      processed_at: new Date().toISOString()
    })
    .eq('status', 'processing')
  
  if (memError) {
    console.error('   ❌ Error updating memory queue:', memError.message)
  } else {
    console.log('   ✅ Memory queue processing items marked as failed')
  }

  const { error: codeError } = await supabase
    .from('code_processing_queue')
    .update({ 
      status: 'failed',
      error: 'Stopped by admin for fixes'
    })
    .eq('status', 'processing')
  
  if (codeError) {
    console.error('   ❌ Error updating code queue:', codeError.message)
  } else {
    console.log('   ✅ Code queue processing items marked as failed')
  }

  // 2. Clear all pending items
  console.log('\n2. Clearing all queue items...')
  
  const tables = ['memory_queue', 'code_processing_queue']
  
  for (const table of tables) {
    const { error } = await supabase
      .from(table)
      .delete()
      .not('id', 'is', null)
    
    if (error) {
      console.error(`   ❌ Error clearing ${table}:`, error.message)
    } else {
      console.log(`   ✅ ${table} cleared`)
    }
  }

  console.log('\n✅ Queues stopped and cleared')
}

stopAndResetQueues().then(() => {
  console.log('\nDone!')
  process.exit(0)
}).catch(err => {
  console.error('Error:', err)
  process.exit(1)
})