import dotenv from 'dotenv'
import path from 'path'

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

// Note: Edge function logs are in a separate analytics database
// We need to use the Supabase Dashboard API to access them

console.log(`
Edge Function Logs Access Instructions:
======================================

Since edge function logs are stored in a separate analytics database,
you need to access them through the Supabase Dashboard:

1. Go to: https://supabase.com/dashboard/project/zqlfxakbkwssxfynrmnk/logs/edge-functions

2. Or use the SQL Editor in the dashboard with these queries:

-- View recent logs for github-code-parser-worker
SELECT 
  id,
  timestamp,
  event_message,
  metadata.level as level,
  metadata.function_id as function_id
FROM function_logs
CROSS JOIN unnest(metadata) as metadata
WHERE metadata.function_id = 'github-code-parser-worker'
  AND timestamp > NOW() - INTERVAL '30 minutes'
ORDER BY timestamp DESC
LIMIT 50;

-- Find errors specifically
SELECT 
  id,
  timestamp,
  event_message,
  metadata.level as level,
  metadata.error_type as error_type
FROM function_logs
CROSS JOIN unnest(metadata) as metadata
WHERE metadata.function_id = 'github-code-parser-worker'
  AND metadata.level IN ('error', 'warning')
  AND timestamp > NOW() - INTERVAL '1 hour'
ORDER BY timestamp DESC
LIMIT 50;

-- Search for specific patterns in logs
SELECT 
  id,
  timestamp,
  event_message
FROM function_logs
CROSS JOIN unnest(metadata) as metadata
WHERE metadata.function_id = 'github-code-parser-worker'
  AND (
    event_message LIKE '%error%'
    OR event_message LIKE '%failed%'
    OR event_message LIKE '%exception%'
  )
  AND timestamp > NOW() - INTERVAL '1 hour'
ORDER BY timestamp DESC
LIMIT 50;

3. Alternative: Check the project's function invocations:
   https://supabase.com/dashboard/project/zqlfxakbkwssxfynrmnk/functions/github-code-parser-worker/details
`)