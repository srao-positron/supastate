#!/usr/bin/env npx tsx

/**
 * Check the status of the ingest-code function
 * This script checks edge function logs, code entities, and queue status
 */

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkIngestCodeStatus() {
  console.log('=== Checking ingest-code function status ===\n')

  // 1. Check recent code entities
  console.log('1. Recent code entities created:')
  console.log('-------------------------------')
  
  const { data: totalCount } = await supabase
    .from('code_entities')
    .select('id', { count: 'exact', head: true })

  console.log(`Total code entities: ${totalCount ?? 0}`)

  const { data: recentEntities, error: entitiesError } = await supabase
    .from('code_entities')
    .select('id, file_path, created_at')
    .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(10)

  if (entitiesError) {
    console.error('Error fetching code entities:', entitiesError)
  } else if (recentEntities && recentEntities.length > 0) {
    console.log(`\nRecent entities (last 5 minutes): ${recentEntities.length}`)
    recentEntities.forEach(entity => {
      console.log(`  - ${entity.id}: ${entity.file_path} (${entity.created_at})`)
    })
  } else {
    console.log('\nNo code entities created in the last 5 minutes')
  }

  // 2. Check queue status
  console.log('\n\n2. Code ingestion queue status:')
  console.log('--------------------------------')

  // Check queue messages
  const { data: queueData, error: queueError } = await supabase.rpc('pgmq_peek', {
    queue_name: 'code_ingestion',
    n: 10,
    order: 'desc'
  })

  if (queueError) {
    console.error('Error checking queue:', queueError)
  } else if (queueData && queueData.length > 0) {
    console.log(`\nQueue messages: ${queueData.length}`)
    queueData.forEach((msg: any) => {
      const entityId = msg.message?.code_entity_id || 'unknown'
      console.log(`  - Message ${msg.msg_id}: entity_id=${entityId}, enqueued=${msg.enqueued_at}`)
    })
  } else {
    console.log('\nNo messages in queue')
  }

  // 3. Check queue metrics
  const { data: metricsData, error: metricsError } = await supabase.rpc('pgmq_metrics', {
    queue_name: 'code_ingestion'
  })

  if (!metricsError && metricsData) {
    console.log('\nQueue metrics:')
    console.log(`  - Total messages: ${metricsData.total_messages || 0}`)
    console.log(`  - Messages per hour: ${metricsData.messages_per_hour || 0}`)
    console.log(`  - Messages per minute: ${metricsData.messages_per_minute || 0}`)
  }

  // 4. Check recent ingestion logs
  console.log('\n\n3. Recent ingestion logs:')
  console.log('-------------------------')

  const { data: logsData, error: logsError } = await supabase
    .from('code_ingestion_logs')
    .select('*')
    .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(10)

  if (logsError) {
    console.error('Error fetching logs:', logsError)
  } else if (logsData && logsData.length > 0) {
    console.log(`\nRecent logs: ${logsData.length}`)
    logsData.forEach(log => {
      console.log(`  - ${log.id}: ${log.status} - ${log.message || 'No message'} (${log.created_at})`)
      if (log.error) {
        console.log(`    Error: ${JSON.stringify(log.error)}`)
      }
    })
  } else {
    console.log('\nNo ingestion logs in the last 5 minutes')
  }

  // 5. Edge function logs (requires different approach)
  console.log('\n\n4. Edge function logs:')
  console.log('----------------------')
  console.log('To check edge function logs, use the Supabase Dashboard SQL editor:')
  console.log('https://supabase.com/dashboard/project/zqlfxakbkwssxfynrmnk/sql/new')
  console.log('\nRun this query:')
  console.log(`
-- Check recent ingest-code function logs
SELECT 
  timestamp,
  event_message
FROM function_logs
CROSS JOIN unnest(metadata) as metadata
WHERE event_message LIKE '%Ingest Code%'
  AND timestamp > NOW() - INTERVAL '5 minutes'
ORDER BY timestamp DESC
LIMIT 30;

-- Or check for specific entity IDs
SELECT 
  timestamp,
  event_message
FROM function_logs
CROSS JOIN unnest(metadata) as metadata
WHERE event_message LIKE '%code_entity_id%'
  AND timestamp > NOW() - INTERVAL '5 minutes'
ORDER BY timestamp DESC
LIMIT 30;
  `)

  // 6. Check if there are any entities waiting to be processed
  console.log('\n\n5. Entities pending Neo4j ingestion:')
  console.log('------------------------------------')

  const { data: pendingEntities, error: pendingError } = await supabase
    .from('code_entities')
    .select('id, file_path, created_at', { count: 'exact' })
    .is('ingested_to_neo4j', null)
    .order('created_at', { ascending: false })
    .limit(10)

  if (pendingError) {
    console.error('Error fetching pending entities:', pendingError)
  } else {
    const count = (pendingEntities as any)?.count || pendingEntities?.length || 0
    console.log(`\nTotal pending: ${count}`)
    if (pendingEntities && pendingEntities.length > 0) {
      console.log('Recent pending entities:')
      pendingEntities.forEach(entity => {
        console.log(`  - ${entity.id}: ${entity.file_path} (${entity.created_at})`)
      })
    }
  }

  process.exit(0)
}

checkIngestCodeStatus().catch(console.error)