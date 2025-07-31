-- Clear PGMQ code_ingestion queue
-- This script will show current queue length, purge all messages, and verify the queue is empty

-- 1. First show the current queue length
SELECT 'Current queue length:' as status;
SELECT COUNT(*) as message_count 
FROM pgmq.q_code_ingestion;

-- Show queue metrics (if available)
SELECT 'Queue metrics:' as status;
SELECT * FROM pgmq.metrics('code_ingestion');

-- 2. Clear/delete all messages from the code_ingestion queue
-- Using purge_queue to remove all messages at once
SELECT 'Purging queue...' as status;
SELECT pgmq.purge_queue('code_ingestion') as messages_deleted;

-- 3. Verify the queue is empty
SELECT 'Queue after purge:' as status;
SELECT COUNT(*) as message_count 
FROM pgmq.q_code_ingestion;

-- Show updated metrics
SELECT 'Updated queue metrics:' as status;
SELECT * FROM pgmq.metrics('code_ingestion');

-- Create a reusable wrapper function for purging queues (optional)
CREATE OR REPLACE FUNCTION public.pgmq_purge_queue(queue_name text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN pgmq.purge_queue(queue_name);
END;
$$;

-- Grant permission to service_role
GRANT EXECUTE ON FUNCTION public.pgmq_purge_queue TO service_role;

-- Alternative method if purge_queue doesn't work:
-- You can uncomment and use this batch delete approach
/*
-- Delete messages in batches (more efficient for large queues)
DO $$
DECLARE
    deleted_count INTEGER;
    total_deleted INTEGER := 0;
BEGIN
    LOOP
        -- Delete up to 1000 messages at a time
        WITH deleted AS (
            SELECT msg_id 
            FROM pgmq.q_code_ingestion 
            LIMIT 1000
        )
        SELECT COUNT(*) INTO deleted_count
        FROM deleted
        WHERE pgmq.delete('code_ingestion', msg_id);
        
        total_deleted := total_deleted + deleted_count;
        
        -- Exit when no more messages
        EXIT WHEN deleted_count = 0;
        
        -- Log progress
        RAISE NOTICE 'Deleted % messages, total: %', deleted_count, total_deleted;
    END LOOP;
    
    RAISE NOTICE 'Total messages deleted: %', total_deleted;
END $$;
*/