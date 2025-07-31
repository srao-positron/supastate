-- Check recent edge function logs for ingestion issues
-- Run this in Supabase Dashboard SQL Editor

-- Check the last 30 minutes of logs
SELECT 
  id,
  timestamp,
  event_message,
  metadata.level as level,
  metadata.function_id as function_id,
  metadata.execution_id as execution_id
FROM function_logs
CROSS JOIN unnest(metadata) as metadata
WHERE timestamp > NOW() - INTERVAL '30 minutes'
  AND (
    event_message LIKE '%memory-ingestion%'
    OR event_message LIKE '%code-ingestion%'
    OR event_message LIKE '%ingest-memory-to-neo4j%'
    OR event_message LIKE '%ingest-code-to-neo4j%'
    OR event_message LIKE '%Error%'
    OR event_message LIKE '%error%'
  )
ORDER BY timestamp DESC
LIMIT 100;

-- Check specifically for successful Neo4j operations
SELECT 
  id,
  timestamp,
  event_message
FROM function_logs
CROSS JOIN unnest(metadata) as metadata
WHERE timestamp > NOW() - INTERVAL '30 minutes'
  AND (
    event_message LIKE '%Created Memory node%'
    OR event_message LIKE '%Created CodeEntity node%'
    OR event_message LIKE '%Processing%entities%'
    OR event_message LIKE '%Processing%memories%'
  )
ORDER BY timestamp DESC
LIMIT 50;