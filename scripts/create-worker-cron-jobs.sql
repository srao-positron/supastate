-- Create the worker cron jobs (without trying to update existing ones)

-- 1. Create the missing code_ingestion queue first
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pgmq.meta WHERE queue_name = 'code_ingestion') THEN
    PERFORM pgmq.create('code_ingestion');
    RAISE NOTICE 'Created code_ingestion queue';
  END IF;
END $$;

-- 2. Create new cron jobs for the queue workers
-- Memory ingestion worker - every 30 seconds
SELECT cron.schedule(
  'memory-ingestion-worker-30s',
  '*/30 * * * * *',
  $$
  SELECT net.http_post(
    url := 'https://zqlfxakbkwssxfynrmnk.supabase.co/functions/v1/memory-ingestion-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxbGZ4YWtia3dzc3hmeW5ybW5rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzEyNDMxMiwiZXhwIjoyMDY4NzAwMzEyfQ.Dvvga6Y4vu7xtorjzgQ3B4kjoJYvISQcnOEAIuoFSOU'
    ),
    body := jsonb_build_object('trigger', 'cron')
  );
  $$
);

-- Pattern detection worker - every minute
SELECT cron.schedule(
  'pattern-detection-worker-1m',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://zqlfxakbkwssxfynrmnk.supabase.co/functions/v1/pattern-detection-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxbGZ4YWtia3dzc3hmeW5ybW5rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzEyNDMxMiwiZXhwIjoyMDY4NzAwMzEyfQ.Dvvga6Y4vu7xtorjzgQ3B4kjoJYvISQcnOEAIuoFSOU'
    ),
    body := jsonb_build_object('trigger', 'cron')
  );
  $$
);

-- Code ingestion worker - every minute
SELECT cron.schedule(
  'code-ingestion-worker-1m',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://zqlfxakbkwssxfynrmnk.supabase.co/functions/v1/code-ingestion-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxbGZ4YWtia3dzc3hmeW5ybW5rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzEyNDMxMiwiZXhwIjoyMDY4NzAwMzEyfQ.Dvvga6Y4vu7xtorjzgQ3B4kjoJYvISQcnOEAIuoFSOU'
    ),
    body := jsonb_build_object('trigger', 'cron')
  );
  $$
);

-- 3. Show all cron jobs
SELECT jobname, schedule, active,
       CASE 
         WHEN command LIKE '%memory-ingestion-worker%' THEN '✅ NEW Worker'
         WHEN command LIKE '%pattern-detection-worker%' THEN '✅ NEW Worker'
         WHEN command LIKE '%code-ingestion-worker%' THEN '✅ NEW Worker'
         WHEN command LIKE '%enhanced-process-neo4j%' THEN '❌ OLD - Please disable in dashboard'
         WHEN command LIKE '%process-code%' THEN '❌ OLD - Please disable in dashboard'
         ELSE 'Other'
       END as status
FROM cron.job 
ORDER BY jobname;