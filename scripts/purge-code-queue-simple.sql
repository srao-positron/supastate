-- Simple script to purge the code_ingestion queue

-- Show current queue size
SELECT COUNT(*) as current_messages FROM pgmq.q_code_ingestion;

-- Purge all messages from the queue
SELECT pgmq.purge_queue('code_ingestion') as messages_deleted;

-- Verify queue is empty
SELECT COUNT(*) as remaining_messages FROM pgmq.q_code_ingestion;