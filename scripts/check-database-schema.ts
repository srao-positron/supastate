#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

async function checkDatabaseSchema() {
  console.log('=== Checking Database Schema ===\n')

  // 1. Check all tables
  console.log('1. ALL TABLES IN PUBLIC SCHEMA:')
  const { data: tables, error: tablesError } = await supabase.rpc('get_tables_info', {
    schema_name: 'public'
  }).single()

  if (tablesError) {
    // Try alternative query
    const { data: altTables, error: altError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .order('table_name')

    if (altError) {
      console.error('Error getting tables:', altError)
      // Try raw SQL
      const { data: rawTables, error: rawError } = await supabase.rpc('get_schema_info')
      
      if (rawError) {
        console.error('Error with raw query:', rawError)
      } else {
        console.log('Tables found:', rawTables)
      }
    } else {
      console.log('Tables found:', altTables?.map(t => t.table_name).join(', '))
    }
  } else {
    console.log('Tables:', tables)
  }

  // 2. Check code-related tables specifically
  console.log('\n2. CHECKING CODE-RELATED TABLES:')
  const codeTables = ['code_files', 'code_entities', 'code_chunks', 'code_relationships']
  
  for (const tableName of codeTables) {
    const { count, error } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true })
    
    if (error) {
      console.log(`  - ${tableName}: NOT FOUND (${error.message})`)
    } else {
      console.log(`  - ${tableName}: ${count} rows`)
    }
  }

  // 3. Check queue-related tables
  console.log('\n3. CHECKING QUEUE TABLES:')
  const queueTables = ['pgmq.queue', 'pgmq.archive', 'pattern_detection_queue', 'memory_ingestion_queue', 'code_ingestion_queue']
  
  for (const tableName of queueTables) {
    const { count, error } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true })
    
    if (error) {
      console.log(`  - ${tableName}: NOT FOUND (${error.message})`)
    } else {
      console.log(`  - ${tableName}: ${count} rows`)
    }
  }

  // 4. Check RPC functions
  console.log('\n4. CHECKING QUEUE RPC FUNCTIONS:')
  const functions = [
    'pgmq_send',
    'pgmq_read',
    'pgmq_create',
    'pgmq_list_queues',
    'queue_code_ingestion_job',
    'queue_memory_ingestion_job',
    'queue_pattern_detection_job'
  ]

  for (const func of functions) {
    try {
      // Just check if function exists by trying to call with wrong params
      const { error } = await supabase.rpc(func, {})
      if (error && error.message.includes('Could not find')) {
        console.log(`  - ${func}: NOT FOUND`)
      } else {
        console.log(`  - ${func}: EXISTS`)
      }
    } catch (e) {
      console.log(`  - ${func}: EXISTS (error in params)`)
    }
  }

  // 5. Check user data
  console.log('\n5. CHECKING USER DATA:')
  const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers()
  
  if (authError) {
    console.error('Error getting users:', authError)
  } else {
    console.log(`Total users: ${authUsers.users.length}`)
    const camilleUsers = authUsers.users.filter(u => 
      u.email?.includes('camille') || 
      u.user_metadata?.full_name?.includes('camille')
    )
    
    if (camilleUsers.length > 0) {
      console.log('\nCamille-related users:')
      camilleUsers.forEach(user => {
        console.log(`  - ${user.email} (ID: ${user.id})`)
        console.log(`    Created: ${user.created_at}`)
      })
    }
  }

  // 6. Check code entities with direct SQL
  console.log('\n6. CHECKING CODE_ENTITIES TABLE STRUCTURE:')
  const { data: codeEntitiesInfo, error: ceError } = await supabase
    .from('code_entities')
    .select('*')
    .limit(5)

  if (ceError) {
    console.error('Error checking code_entities:', ceError)
  } else {
    console.log(`Found ${codeEntitiesInfo?.length || 0} code entities`)
    if (codeEntitiesInfo && codeEntitiesInfo.length > 0) {
      console.log('Sample entity:', JSON.stringify(codeEntitiesInfo[0], null, 2))
    }
  }
}

checkDatabaseSchema().catch(console.error)