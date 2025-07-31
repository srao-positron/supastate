#!/usr/bin/env npx tsx

/**
 * Check Supabase edge function logs
 */

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

async function checkEdgeLogs() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  console.log('\n=== Checking Edge Function Logs ===')
  console.log('Note: Edge function logs are best viewed in the Supabase Dashboard')
  console.log('Direct link: https://supabase.com/dashboard/project/zqlfxakbkwssxfynrmnk/logs/edge-functions')
  
  // Unfortunately, the analytics API requires platform authentication
  // which is different from service role keys
  
  console.log('\nTo check logs programmatically, you need to:')
  console.log('1. Use the Supabase Dashboard SQL Editor')
  console.log('2. Run these queries:')
  
  const queries = [
    {
      name: 'Recent pattern processor logs',
      sql: `
SELECT 
  id,
  timestamp,
  event_message,
  metadata.level as level,
  metadata.function_id as function_id
FROM function_logs
CROSS JOIN unnest(metadata) as metadata
WHERE metadata.function_id = 'pattern-processor'
  AND timestamp > NOW() - INTERVAL '30 minutes'
ORDER BY timestamp DESC
LIMIT 50`
    },
    {
      name: 'Pattern processor errors',
      sql: `
SELECT 
  id,
  timestamp,
  event_message,
  metadata.level as level,
  metadata.error_type as error_type
FROM function_logs
CROSS JOIN unnest(metadata) as metadata
WHERE metadata.function_id = 'pattern-processor'
  AND metadata.level IN ('error', 'warning')
  AND timestamp > NOW() - INTERVAL '1 hour'
ORDER BY timestamp DESC
LIMIT 50`
    },
    {
      name: 'Batch processing logs',
      sql: `
SELECT 
  id,
  timestamp,
  event_message
FROM function_logs
CROSS JOIN unnest(metadata) as metadata
WHERE (event_message LIKE '%Batch%' OR event_message LIKE '%pattern%')
  AND timestamp > NOW() - INTERVAL '30 minutes'
ORDER BY timestamp DESC
LIMIT 50`
    }
  ]
  
  queries.forEach((q, idx) => {
    console.log(`\n${idx + 1}. ${q.name}:`)
    console.log('```sql')
    console.log(q.sql.trim())
    console.log('```')
  })
  
  // Alternative: Try to get logs from the function invocation response
  console.log('\n\n=== Checking Recent Function Invocations ===')
  
  try {
    // Get recent pattern detection results by checking Neo4j
    console.log('Checking Neo4j for recent pattern activity...')
    
    // This would need Neo4j connection
    console.log('Run this script to check patterns: npx tsx scripts/check-patterns.ts')
    
  } catch (error) {
    console.error('Error checking function status:', error)
  }
}

checkEdgeLogs().catch(console.error)