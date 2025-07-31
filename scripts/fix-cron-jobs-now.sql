-- Fix cron jobs to use the new queue workers

-- 1. First disable the old jobs that are failing
UPDATE cron.job SET active = false WHERE jobname IN ('process-memory-queue', 'process-code-queue');

-- 2. Try to unschedule them (ignore errors if they fail)
DO $$
BEGIN
  PERFORM cron.unschedule('process-memory-queue');
  PERFORM cron.unschedule('process-code-queue');
EXCEPTION WHEN OTHERS THEN
  -- Ignore errors
END $$;

-- 3. Create new cron jobs for the queue workers
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

-- 4. Create the missing code_ingestion queue
SELECT pgmq.create_if_not_exists('code_ingestion');

-- 5. View the updated jobs
SELECT jobname, schedule, active, 
       CASE 
         WHEN command LIKE '%memory-ingestion-worker%' THEN '✅ NEW Worker'
         WHEN command LIKE '%pattern-detection-worker%' THEN '✅ NEW Worker'
         WHEN command LIKE '%code-ingestion-worker%' THEN '✅ NEW Worker'
         WHEN command LIKE '%enhanced-process-neo4j%' THEN '❌ OLD Function'
         WHEN command LIKE '%process-code%' THEN '❌ OLD Function'
         ELSE '❓ Other'
       END as status
FROM cron.job 
WHERE jobname LIKE '%memory%' OR jobname LIKE '%code%' OR jobname LIKE '%pattern%'
ORDER BY jobname;