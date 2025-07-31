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
  }
})

async function findPgmqTables() {
  console.log('🔍 Looking for PGMQ tables and queues...\n')

  try {
    // Check information_schema for tables
    const { data: tables, error: tablesError } = await supabase
      .rpc('query_info_schema_tables')
      .select('*')

    if (tablesError) {
      // Fallback: try direct query on pg_tables
      const { data: pgTables, error: pgError } = await supabase
        .from('pg_tables')
        .select('schemaname, tablename')
        .or('tablename.like.%pgmq%,tablename.like.%github_code%')
        .limit(50)

      if (!pgError && pgTables) {
        console.log('Found tables via pg_tables:')
        pgTables.forEach(t => {
          console.log(`  - ${t.schemaname}.${t.tablename}`)
        })
      }
    }

    // Try to access pgmq schema directly
    console.log('\n📋 Checking pgmq schema tables...')
    const pgmqSupabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      },
      db: {
        schema: 'pgmq'
      }
    })

    // List all tables in pgmq schema
    const { data: pgmqMeta, error: metaError } = await pgmqSupabase
      .from('meta')
      .select('*')
      .limit(10)

    if (!metaError) {
      console.log('PGMQ meta table contents:')
      console.log(pgmqMeta)
    }

    // Try to access the github_code_parsing queue directly in pgmq schema
    console.log('\n🎯 Trying to access github_code_parsing queue in pgmq schema...')
    const { count, error: queueError } = await pgmqSupabase
      .from('github_code_parsing')
      .select('*', { count: 'exact', head: true })

    if (!queueError) {
      console.log(`✅ Found github_code_parsing queue in pgmq schema with ${count} messages`)
      
      // Now try to purge it
      console.log('\n🗑️  Attempting to delete all messages from pgmq.github_code_parsing...')
      const { error: deleteError } = await pgmqSupabase
        .from('github_code_parsing')
        .delete()
        .gte('msg_id', 0)

      if (!deleteError) {
        console.log('✅ Successfully deleted all messages!')
        
        // Verify deletion
        const { count: newCount } = await pgmqSupabase
          .from('github_code_parsing')
          .select('*', { count: 'exact', head: true })
        
        console.log(`Queue now has ${newCount} messages`)
      } else {
        console.log('❌ Delete failed:', deleteError)
      }
    } else {
      console.log('❌ Could not access queue:', queueError)
    }

    // Also try the public schema queue functions
    console.log('\n🔧 Checking available queue functions...')
    const { data: archiveResult, error: archiveError } = await supabase
      .rpc('pgmq_archive', {
        queue_name: 'github_code_parsing'
      })

    if (!archiveError) {
      console.log('✅ Successfully archived messages using pgmq_archive')
    } else {
      console.log('❌ Archive failed:', archiveError.message)
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error)
  }
}

findPgmqTables().then(() => {
  console.log('\n✅ Done!')
  process.exit(0)
}).catch(error => {
  console.error('\n❌ Script failed:', error)
  process.exit(1)
})