#!/usr/bin/env npx tsx

/**
 * Check the actual schemas of memories and code_entities tables
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkSchemas() {
  console.log('=== Checking Table Schemas ===\n')

  // Check memories table schema
  const { data: memoryColumns, error: memError } = await supabase
    .from('information_schema.columns')
    .select('column_name, data_type')
    .eq('table_schema', 'public')
    .eq('table_name', 'memories')
    .order('ordinal_position')

  console.log('memories table columns:')
  if (memError) {
    console.error('Error:', memError)
  } else {
    memoryColumns?.forEach(col => {
      console.log(`  - ${col.column_name} (${col.data_type})`)
    })
  }

  // Check code_entities table schema
  const { data: codeColumns, error: codeError } = await supabase
    .from('information_schema.columns')
    .select('column_name, data_type')
    .eq('table_schema', 'public')
    .eq('table_name', 'code_entities')
    .order('ordinal_position')

  console.log('\n\ncode_entities table columns:')
  if (codeError) {
    console.error('Error:', codeError)
  } else {
    codeColumns?.forEach(col => {
      console.log(`  - ${col.column_name} (${col.data_type})`)
    })
  }

  // Get sample data from each table
  console.log('\n\n=== Sample Data ===\n')

  // Sample memory
  const { data: sampleMemory, error: sampleMemError } = await supabase
    .from('memories')
    .select('*')
    .limit(1)
    .single()

  console.log('Sample memory:')
  if (sampleMemError) {
    console.error('Error:', sampleMemError)
  } else if (sampleMemory) {
    console.log(JSON.stringify(sampleMemory, null, 2))
  }

  // Sample code entity
  const { data: sampleCode, error: sampleCodeError } = await supabase
    .from('code_entities')
    .select('*')
    .limit(1)
    .single()

  console.log('\n\nSample code_entity:')
  if (sampleCodeError) {
    console.error('Error:', sampleCodeError)
  } else if (sampleCode) {
    console.log(JSON.stringify(sampleCode, null, 2))
  }
}

checkSchemas().catch(console.error)