-- Clear all PGMQ queues script
-- Run this in the Supabase Dashboard SQL editor or via psql

-- First, show current queue depths
\echo '📊 Current queue depths before purging:'
SELECT 
    'memory_ingestion' as queue_name,
    COUNT(*) as message_count
FROM pgmq.memory_ingestion
UNION ALL
SELECT 
    'code_ingestion' as queue_name,
    COUNT(*) as message_count
FROM pgmq.code_ingestion
UNION ALL
SELECT 
    'pattern_detection' as queue_name,
    COUNT(*) as message_count
FROM pgmq.pattern_detection;

\echo '\n🧹 Purging all queues...'

-- Purge all queues
SELECT pgmq.purge_queue('memory_ingestion');
SELECT pgmq.purge_queue('code_ingestion');
SELECT pgmq.purge_queue('pattern_detection');

\echo '\n✅ Queues purged!'

-- Check queue depths after purging
\echo '\n📊 Queue depths after purging:'
SELECT 
    'memory_ingestion' as queue_name,
    COUNT(*) as message_count
FROM pgmq.memory_ingestion
UNION ALL
SELECT 
    'code_ingestion' as queue_name,
    COUNT(*) as message_count
FROM pgmq.code_ingestion
UNION ALL
SELECT 
    'pattern_detection' as queue_name,
    COUNT(*) as message_count
FROM pgmq.pattern_detection;

\echo '\n✨ All queues have been cleared!'