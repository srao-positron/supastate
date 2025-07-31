#!/usr/bin/env npx tsx

/**
 * Show SQL queries to check edge function logs in dashboard
 */

console.log(`
=== Edge Function Log Queries ===

Go to: https://supabase.com/dashboard/project/zqlfxakbkwssxfynrmnk/sql/new

Run these queries to check pattern-processor logs:

1. Recent logs (last hour):
--------------------
SELECT 
  timestamp,
  event_message
FROM function_logs
CROSS JOIN unnest(metadata) as metadata
WHERE metadata.function_id = 'pattern-processor'
  AND timestamp > NOW() - INTERVAL '1 hour'
ORDER BY timestamp DESC
LIMIT 50;


2. Errors only:
--------------------
SELECT 
  timestamp,
  event_message
FROM function_logs
CROSS JOIN unnest(metadata) as metadata
WHERE metadata.function_id = 'pattern-processor'
  AND metadata.level = 'error'
  AND timestamp > NOW() - INTERVAL '24 hours'
ORDER BY timestamp DESC
LIMIT 20;


3. Search for semantic pattern logs:
--------------------
SELECT 
  timestamp,
  event_message
FROM function_logs
CROSS JOIN unnest(metadata) as metadata
WHERE metadata.function_id = 'pattern-processor'
  AND (event_message LIKE '%semantic%' 
       OR event_message LIKE '%similar%'
       OR event_message LIKE '%Found%')
  AND timestamp > NOW() - INTERVAL '1 hour'
ORDER BY timestamp DESC
LIMIT 50;
`)