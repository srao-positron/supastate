-- Check all ingestion-related edge function logs
-- Run this in the Supabase Dashboard SQL Editor

-- Recent ingestion worker logs
SELECT 
  id,
  timestamp,
  event_message,
  metadata.level as level,
  metadata.function_id as function_id,
  metadata.execution_id as execution_id
FROM function_logs
CROSS JOIN unnest(metadata) as metadata
WHERE (
  event_message LIKE '%memory-ingestion-worker%'
  OR event_message LIKE '%code-ingestion-worker%'
  OR event_message LIKE '%ingest-memory-to-neo4j%'
  OR event_message LIKE '%ingest-code-to-neo4j%'
  OR event_message LIKE '%Ingest Memory to Neo4j%'
  OR event_message LIKE '%Ingest Code to Neo4j%'
)
AND timestamp > NOW() - INTERVAL '6 hours'
ORDER BY timestamp DESC
LIMIT 100;

-- Check for errors specifically
SELECT 
  id,
  timestamp,
  event_message,
  metadata.level as level,
  metadata.error_type as error_type,
  metadata.function_id as function_id
FROM function_logs
CROSS JOIN unnest(metadata) as metadata
WHERE metadata.level = 'error'
  AND (
    event_message LIKE '%ingestion%'
    OR event_message LIKE '%neo4j%'
    OR event_message LIKE '%Neo4j%'
  )
AND timestamp > NOW() - INTERVAL '6 hours'
ORDER BY timestamp DESC
LIMIT 50;

-- Check for successful Neo4j operations
SELECT 
  id,
  timestamp,
  event_message
FROM function_logs
CROSS JOIN unnest(metadata) as metadata
WHERE (
  event_message LIKE '%Created Memory node%'
  OR event_message LIKE '%Created CodeEntity node%'
  OR event_message LIKE '%Successfully ingested%'
  OR event_message LIKE '%nodes created%'
)
AND timestamp > NOW() - INTERVAL '6 hours'
ORDER BY timestamp DESC
LIMIT 50;

-- Check queue processing logs
SELECT 
  id,
  timestamp,
  event_message,
  metadata.function_id as function_id
FROM function_logs
CROSS JOIN unnest(metadata) as metadata
WHERE (
  event_message LIKE '%queue%'
  OR event_message LIKE '%pgmq%'
  OR event_message LIKE '%Processing message%'
)
AND timestamp > NOW() - INTERVAL '3 hours'
ORDER BY timestamp DESC
LIMIT 50;