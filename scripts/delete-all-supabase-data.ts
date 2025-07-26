import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = `https://${process.env.SUPABASE_PROJECT_ID}.supabase.co`
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function deleteAllSupabaseData() {
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false
    }
  })

  console.log('🗑️  Deleting all data from Supabase...\n')

  // Tables to clean, in order to handle foreign key constraints
  const tables = [
    'code_processing_queue',
    'code_processing_tasks',
    'code_files',
    'memories',
    'project_summaries',
    'orchestration_jobs',
    'review_events',
    'reviews',
    // Don't delete user/team data
    // 'team_members',
    // 'teams',
    // 'api_keys',
    // 'profiles'
  ]

  console.log('⚠️  WARNING: This will delete ALL data from the following tables:')
  tables.forEach(table => console.log(`  - ${table}`))
  console.log('\nPress Ctrl+C to cancel, or wait 5 seconds to continue...\n')
  await new Promise(resolve => setTimeout(resolve, 5000))

  for (const table of tables) {
    try {
      // Get count first
      const { count, error: countError } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })

      if (countError) {
        console.log(`⚠️  Error counting ${table}: ${countError.message}`)
        continue
      }

      console.log(`Deleting ${count || 0} rows from ${table}...`)

      // Delete all rows
      const { error } = await supabase
        .from(table)
        .delete()
        .gte('created_at', '1900-01-01') // Delete everything by using an old date

      if (error) {
        console.log(`  ❌ Error: ${error.message}`)
      } else {
        console.log(`  ✅ Deleted successfully`)
      }
    } catch (error) {
      console.log(`  ❌ Error with ${table}: ${error}`)
    }
  }

  // Verify counts
  console.log('\nVerifying deletion...')
  let totalRemaining = 0
  
  for (const table of tables) {
    const { count } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
    
    if (count && count > 0) {
      console.log(`  ⚠️  ${table} still has ${count} rows`)
      totalRemaining += count
    }
  }

  if (totalRemaining === 0) {
    console.log('✅ All data successfully deleted from Supabase tables')
  } else {
    console.log(`⚠️  ${totalRemaining} rows still remain across tables`)
  }
}

deleteAllSupabaseData().then(() => {
  console.log('\nDone!')
  process.exit(0)
}).catch(err => {
  console.error('Error:', err)
  process.exit(1)
})