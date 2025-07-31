-- Fix existing cron jobs to call the new queue workers

-- 1. Unschedule the old/broken jobs
SELECT cron.unschedule('process-memory-queue');
SELECT cron.unschedule('process-code-queue');
SELECT cron.unschedule('pattern-detection-5min');

-- 2. Create new cron jobs for the queue workers
-- Memory ingestion worker - runs every 30 seconds
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

-- Pattern detection worker - runs every minute
SELECT cron.schedule(
  'pattern-detection-worker-1m',
  '*/1 * * * *',
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

-- Code ingestion worker - runs every minute  
SELECT cron.schedule(
  'code-ingestion-worker-1m',
  '*/1 * * * *',
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

-- View all cron jobs
SELECT jobname, schedule, active, command 
FROM cron.job 
ORDER BY jobname;