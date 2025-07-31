import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  },
  db: {
    schema: 'public'
  }
})

async function checkPgmqFunctions() {
  console.log('🔍 Checking available PGMQ functions...\n')

  try {
    // Query to find all PGMQ-related functions
    const { data: functions, error } = await supabase.rpc('get_available_functions', {}).catch(() => {
      // If that doesn't work, try a direct query
      return supabase.from('pg_proc').select('*').limit(1).catch(() => ({ data: null, error: null }))
    })

    // Alternative approach: check information_schema
    const query = `
      SELECT 
        routine_schema,
        routine_name,
        data_type,
        routine_definition
      FROM information_schema.routines
      WHERE routine_schema IN ('public', 'pgmq')
        AND routine_name LIKE '%pgmq%'
      ORDER BY routine_name;
    `

    const { data: pgmqFunctions, error: queryError } = await supabase.rpc('exec_sql', { sql: query }).catch(() => {
      // Try without wrapper
      return { data: null, error: 'Could not execute query' }
    })

    if (pgmqFunctions) {
      console.log('Found PGMQ functions:', pgmqFunctions)
    }

    // Let's try to use PGMQ's purge function directly
    console.log('\n🧹 Attempting to purge github_code_parsing queue...\n')

    // Try different purge methods
    console.log('1. Trying pgmq.purge_queue()...')
    const { data: purge1, error: error1 } = await supabase.rpc('purge_queue', {
      queue_name: 'github_code_parsing'
    })
    
    if (!error1) {
      console.log('✅ Success with pgmq.purge_queue():', purge1)
    } else {
      console.log('❌ Failed:', error1.message)
      
      // Try with schema prefix
      console.log('\n2. Trying with direct SQL execution...')
      const purgeQuery = `SELECT pgmq.purge_queue('github_code_parsing');`
      const { data: purge2, error: error2 } = await supabase.rpc('exec_sql', { sql: purgeQuery }).catch(() => {
        return { data: null, error: { message: 'exec_sql not available' } }
      })
      
      if (!error2) {
        console.log('✅ Success with direct SQL:', purge2)
      } else {
        console.log('❌ Failed:', error2.message)
        
        // Try deleting all messages
        console.log('\n3. Trying to delete all messages from queue table...')
        const { data: deleteResult, error: deleteError } = await supabase
          .from('pgmq_github_code_parsing')
          .delete()
          .neq('msg_id', -1) // Delete all (msg_id is never -1)
          
        if (!deleteError) {
          console.log('✅ Deleted messages directly from table')
        } else {
          console.log('❌ Failed to delete:', deleteError)
        }
      }
    }

    // Check final queue status
    console.log('\n📊 Checking final queue status...')
    const { data: finalCount, error: countError } = await supabase
      .from('pgmq_github_code_parsing')
      .select('msg_id', { count: 'exact', head: true })

    if (!countError) {
      console.log(`Queue now contains: ${finalCount} messages`)
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error)
  }
}

checkPgmqFunctions().then(() => {
  console.log('\n✅ Done!')
  process.exit(0)
})