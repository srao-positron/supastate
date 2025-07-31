-- Create the missing code_ingestion queue
SELECT pgmq.create('code_ingestion');

-- Also create a dead letter queue for code ingestion
SELECT pgmq.create('code_ingestion_dlq');

-- Grant permissions
GRANT ALL ON TABLE pgmq.q_code_ingestion TO postgres, authenticated, service_role;
GRANT ALL ON TABLE pgmq.q_code_ingestion_dlq TO postgres, authenticated, service_role;

-- View all queues to confirm
SELECT queue_name, created_at 
FROM pgmq.meta 
ORDER BY queue_name;