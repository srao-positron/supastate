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

async function checkCodeData() {
  console.log('=== Checking Code Data in Supabase ===\n')

  // 1. Check code_files table
  console.log('1. CODE_FILES TABLE:')
  const { data: codeFilesStats, error: codeFilesError } = await supabase
    .from('code_files')
    .select('*', { count: 'exact', head: false })

  if (codeFilesError) {
    console.error('Error checking code_files:', codeFilesError)
  } else {
    console.log(`Total code_files: ${codeFilesStats?.length || 0}`)
    
    // Get recent entries
    const { data: recentFiles } = await supabase
      .from('code_files')
      .select('id, file_path, user_id, workspace_id, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(5)
    
    if (recentFiles && recentFiles.length > 0) {
      console.log('\nRecent code_files:')
      recentFiles.forEach(file => {
        console.log(`  - ${file.file_path} (user: ${file.user_id}, workspace: ${file.workspace_id}, created: ${file.created_at})`)
      })
    }
  }

  // 2. Check code_entities table
  console.log('\n2. CODE_ENTITIES TABLE:')
  const { data: codeEntitiesStats, error: codeEntitiesError } = await supabase
    .from('code_entities')
    .select('*', { count: 'exact', head: false })

  if (codeEntitiesError) {
    console.error('Error checking code_entities:', codeEntitiesError)
  } else {
    console.log(`Total code_entities: ${codeEntitiesStats?.length || 0}`)
    
    // Get recent entries
    const { data: recentEntities } = await supabase
      .from('code_entities')
      .select('id, name, type, user_id, workspace_id, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(5)
    
    if (recentEntities && recentEntities.length > 0) {
      console.log('\nRecent code_entities:')
      recentEntities.forEach(entity => {
        console.log(`  - ${entity.name} (${entity.type}) - user: ${entity.user_id}, workspace: ${entity.workspace_id}, created: ${entity.created_at}`)
      })
    }
  }

  // 3. Check code_ingestion queue
  console.log('\n3. CODE_INGESTION QUEUE STATUS:')
  try {
    // Check queue metrics using pgmq functions
    const { data: queueInfo, error: queueError } = await supabase.rpc('pgmq_metrics_all')
    
    if (queueError) {
      console.error('Error checking queue metrics:', queueError)
    } else {
      const codeQueue = queueInfo?.find((q: any) => q.queue_name === 'code_ingestion')
      if (codeQueue) {
        console.log(`Queue: ${codeQueue.queue_name}`)
        console.log(`  - Total messages: ${codeQueue.total_messages || 0}`)
        console.log(`  - Queue length: ${codeQueue.queue_length || 0}`)
        console.log(`  - Oldest message age: ${codeQueue.oldest_msg_age_sec || 0} seconds`)
        console.log(`  - Newest message age: ${codeQueue.newest_msg_age_sec || 0} seconds`)
      } else {
        console.log('Code ingestion queue not found')
      }
    }

    // Check recent messages
    const { data: recentMessages } = await supabase.rpc('pgmq_read', {
      queue_name: 'code_ingestion',
      vt: 0,
      qty: 5
    })

    if (recentMessages && recentMessages.length > 0) {
      console.log('\nRecent queue messages:')
      recentMessages.forEach((msg: any) => {
        console.log(`  - Message ${msg.msg_id}: ${JSON.stringify(msg.message).substring(0, 100)}...`)
      })
    }
  } catch (error) {
    console.error('Error checking queue:', error)
  }

  // 4. Check if Camille is sending code data (check ingestion logs)
  console.log('\n4. CAMILLE CODE DATA ACTIVITY:')
  const { data: ingestionLogs, error: logsError } = await supabase
    .from('ingestion_logs')
    .select('*')
    .or('type.eq.code,type.eq.code_entity')
    .order('created_at', { ascending: false })
    .limit(10)

  if (logsError) {
    console.error('Error checking ingestion logs:', logsError)
  } else {
    console.log(`Recent code ingestion logs: ${ingestionLogs?.length || 0}`)
    if (ingestionLogs && ingestionLogs.length > 0) {
      console.log('\nRecent ingestion activity:')
      ingestionLogs.forEach(log => {
        console.log(`  - ${log.type} (${log.status}) - user: ${log.user_id}, created: ${log.created_at}`)
        if (log.error) {
          console.log(`    Error: ${log.error}`)
        }
      })
    }
  }

  // 5. Check code-related edge function logs
  console.log('\n5. CODE INGESTION EDGE FUNCTION ACTIVITY:')
  const { data: edgeLogs } = await supabase
    .from('edge_logs')
    .select('*')
    .or('path.like.%/api/neo4j/ingest-code%,path.like.%/ingest-code%')
    .order('timestamp', { ascending: false })
    .limit(5)

  if (edgeLogs && edgeLogs.length > 0) {
    console.log('Recent code ingestion API calls:')
    edgeLogs.forEach(log => {
      console.log(`  - ${log.path} (${log.method}) - status: ${log.status_code}, timestamp: ${log.timestamp}`)
    })
  } else {
    console.log('No recent code ingestion API calls found')
  }

  // 6. Check user activity from Camille
  console.log('\n6. CAMILLE USER CHECK:')
  const { data: users } = await supabase
    .from('profiles')
    .select('*')
    .or('full_name.ilike.%camille%,email.ilike.%camille%')
    .limit(5)

  if (users && users.length > 0) {
    console.log('Found Camille-related users:')
    users.forEach(user => {
      console.log(`  - ${user.full_name || 'N/A'} (${user.email}) - ID: ${user.id}`)
    })
  } else {
    console.log('No Camille-related users found')
  }
}

checkCodeData().catch(console.error)