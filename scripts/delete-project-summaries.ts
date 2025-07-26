import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = `https://${process.env.SUPABASE_PROJECT_ID}.supabase.co`
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function deleteProjectSummaries() {
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false
    }
  })

  console.log('Deleting project summaries...')

  // First try to delete by ID
  const { data: summaries } = await supabase
    .from('project_summaries')
    .select('id')

  if (summaries && summaries.length > 0) {
    for (const summary of summaries) {
      const { error } = await supabase
        .from('project_summaries')
        .delete()
        .eq('id', summary.id)
      
      if (error) {
        console.log(`Error deleting ${summary.id}: ${error.message}`)
      }
    }
  }

  // Verify
  const { count } = await supabase
    .from('project_summaries')
    .select('*', { count: 'exact', head: true })

  console.log(`Remaining summaries: ${count || 0}`)
}

deleteProjectSummaries().then(() => {
  console.log('Done!')
  process.exit(0)
}).catch(err => {
  console.error('Error:', err)
  process.exit(1)
})