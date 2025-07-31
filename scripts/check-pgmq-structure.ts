#!/usr/bin/env npx tsx

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function checkPGMQStructure() {
  console.log('🔍 Checking PGMQ structure in database...\n')

  try {
    // Check if pgmq schema exists
    const { data: schemas, error: schemaError } = await supabase
      .rpc('query_json', {
        query: `
          SELECT schema_name 
          FROM information_schema.schemata 
          WHERE schema_name = 'pgmq'
        `
      })

    if (schemaError) {
      console.error('Error checking schemas:', schemaError)
      return
    }

    if (schemas && schemas.length > 0) {
      console.log('✅ PGMQ schema exists\n')
    } else {
      console.log('❌ PGMQ schema not found\n')
      return
    }

    // List all tables in pgmq schema
    const { data: tables, error: tableError } = await supabase
      .rpc('query_json', {
        query: `
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'pgmq'
          ORDER BY table_name
        `
      })

    if (tableError) {
      console.error('Error listing tables:', tableError)
    } else if (tables) {
      console.log('📋 Tables in pgmq schema:')
      tables.forEach((t: any) => {
        console.log(`  - ${t.table_name}`)
      })
    }

    // Check for github_code_parsing specifically
    console.log('\n🔍 Checking for github_code_parsing queue table...')
    const { data: githubQueue, error: githubError } = await supabase
      .rpc('query_json', {
        query: `
          SELECT 
            table_name,
            (SELECT COUNT(*) FROM pgmq.github_code_parsing) as message_count
          FROM information_schema.tables 
          WHERE table_schema = 'pgmq' 
            AND table_name = 'github_code_parsing'
        `
      })

    if (githubError) {
      console.log('❌ Error checking github_code_parsing:', githubError.message)
    } else if (githubQueue && githubQueue.length > 0) {
      console.log('✅ github_code_parsing queue table exists')
      console.log(`📦 Messages in queue: ${githubQueue[0].message_count || 0}`)
      
      // Try to peek at some messages
      const { data: messages, error: msgError } = await supabase
        .rpc('query_json', {
          query: `
            SELECT 
              msg_id,
              read_ct,
              enqueued_at,
              vt,
              message
            FROM pgmq.github_code_parsing
            ORDER BY enqueued_at DESC
            LIMIT 5
          `
        })
      
      if (!msgError && messages && messages.length > 0) {
        console.log('\n📨 Recent messages:')
        messages.forEach((msg: any, i: number) => {
          console.log(`\n  Message ${i + 1}:`)
          console.log(`    ID: ${msg.msg_id}`)
          console.log(`    Enqueued: ${msg.enqueued_at}`)
          console.log(`    Read Count: ${msg.read_ct}`)
          console.log(`    VT: ${msg.vt}`)
          console.log(`    Content: ${JSON.stringify(msg.message)}`)
        })
      }
    } else {
      console.log('❌ github_code_parsing queue table does not exist')
    }

    // List available PGMQ functions
    console.log('\n📋 Available PGMQ functions:')
    const { data: functions, error: funcError } = await supabase
      .rpc('query_json', {
        query: `
          SELECT 
            routine_name,
            routine_type
          FROM information_schema.routines 
          WHERE routine_schema = 'public' 
            AND routine_name LIKE 'pgmq%'
          ORDER BY routine_name
        `
      })

    if (!funcError && functions) {
      functions.forEach((f: any) => {
        console.log(`  - ${f.routine_name} (${f.routine_type})`)
      })
    }

  } catch (error) {
    console.error('Error:', error)
  }
}

// Run the check
checkPGMQStructure()