#!/usr/bin/env npx tsx

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function checkRLS() {
  console.log('=== Checking RLS and Permissions ===\n')
  
  // 1. Check if RLS is enabled
  const { data: tables, error: tablesError } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT 
        schemaname,
        tablename,
        rowsecurity 
      FROM pg_tables 
      WHERE tablename = 'code_entities'
    `
  }).single()

  if (!tablesError && tables) {
    console.log('Table: code_entities')
    console.log(`RLS Enabled: ${(tables as any).rowsecurity ? 'YES' : 'NO'}\n`)
  }

  // 2. Check RLS policies
  const { data: policies, error: policiesError } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT 
        policyname,
        permissive,
        roles,
        cmd,
        qual,
        with_check
      FROM pg_policies
      WHERE tablename = 'code_entities'
    `
  }).single()

  if (!policiesError && policies) {
    console.log('RLS Policies:')
    console.log(JSON.stringify(policies, null, 2))
  }

  // 3. Test insert with service role
  console.log('\n=== Testing Direct Insert ===\n')
  
  const testId = crypto.randomUUID()
  const testPayload = {
    id: testId,
    team_id: null,
    file_path: '/test/debug.ts',
    name: 'debug.ts',
    entity_type: 'module',
    language: 'typescript',
    source_code: '// test',
    user_id: 'a02c3fed-3a24-442f-becc-97bac8b75e90',
    project_name: 'test-project',
    metadata: {
      contentHash: 'test-hash',
      workspaceId: 'user:a02c3fed-3a24-442f-becc-97bac8b75e90'
    }
  }

  console.log('Attempting insert with ID:', testId)
  
  const { data: inserted, error: insertError } = await supabase
    .from('code_entities')
    .insert(testPayload)
    .select('id')
    .single()

  if (insertError) {
    console.error('Insert failed:', insertError)
  } else if (inserted) {
    console.log('Insert succeeded! Returned data:', inserted)
    
    // Verify it exists
    const { data: verify, error: verifyError } = await supabase
      .from('code_entities')
      .select('id')
      .eq('id', testId)
      .single()
    
    if (verify) {
      console.log('✅ Verification successful - entity exists in database')
      
      // Clean up
      await supabase
        .from('code_entities')
        .delete()
        .eq('id', testId)
      
      console.log('Cleaned up test entity')
    } else {
      console.log('❌ Verification failed - entity not found after insert!')
    }
  } else {
    console.log('⚠️  Insert returned no error but also no data!')
  }
}

checkRLS().catch(console.error)