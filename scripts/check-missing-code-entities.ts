#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

// IDs from the error messages
const missingIds = [
  '5e424194-0fbb-40e8-9270-52521e64ec30',
  '1f6b7766-e6a1-41ad-bb51-5d73d1eb45cb',
  'a2b0b234-e94c-429e-9d05-820decf9856f',
  '2fb254e7-947b-4338-9071-ec9f4dbf9c9e',
  '3be8ca4c-37ab-4197-b81d-f1e84dd89dbc'
]

async function checkMissingEntities() {
  console.log('Checking for specific code entity IDs...\n')

  // Check each ID
  for (const id of missingIds) {
    const { data, error } = await supabase
      .from('code_entities')
      .select('id, file_path, name, created_at, user_id')
      .eq('id', id)
      .single()
    
    if (error && error.code === 'PGRST116') {
      console.log(`❌ ID ${id}: NOT FOUND`)
    } else if (data) {
      console.log(`✅ ID ${id}: Found - ${data.file_path}`)
      console.log(`   User: ${data.user_id}`)
      console.log(`   Created: ${data.created_at}`)
    }
  }

  // Check the queue messages
  console.log('\n\nChecking queue messages via SQL...')
  
  // First check if the pgmq schema exists
  const { data: schemas, error: schemaError } = await supabase.rpc('sql', {
    query: `SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'pgmq'`
  })

  if (schemaError) {
    console.log('Cannot check pgmq schema:', schemaError.message)
  } else if (!schemas || schemas.length === 0) {
    console.log('pgmq schema does not exist')
  } else {
    // Try to query the queue table directly
    const { data: queueData, error: queueError } = await supabase.rpc('sql', {
      query: `
        SELECT msg_id, read_ct, enqueued_at, vt, 
               message->>'code_entity_id' as code_entity_id,
               message->>'user_id' as user_id
        FROM pgmq.code_ingestion 
        WHERE message->>'code_entity_id' IN (
          '5e424194-0fbb-40e8-9270-52521e64ec30',
          '1f6b7766-e6a1-41ad-bb51-5d73d1eb45cb',
          'a2b0b234-e94c-429e-9d05-820decf9856f',
          '2fb254e7-947b-4338-9071-ec9f4dbf9c9e',
          '3be8ca4c-37ab-4197-b81d-f1e84dd89dbc'
        )
        LIMIT 10
      `
    })

    if (queueError) {
      console.log('Cannot query queue directly:', queueError.message)
    } else if (queueData && queueData.length > 0) {
      console.log('Found queue messages with these IDs:')
      queueData.forEach((msg: any) => {
        console.log(`\nMessage ID: ${msg.msg_id}`)
        console.log(`  Code Entity ID: ${msg.code_entity_id}`)
        console.log(`  User ID: ${msg.user_id}`)
        console.log(`  Read Count: ${msg.read_ct}`)
        console.log(`  Enqueued: ${msg.enqueued_at}`)
      })
    } else {
      console.log('No queue messages found with these IDs')
    }
  }
}

checkMissingEntities().catch(console.error)