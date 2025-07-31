-- Update cron jobs to run more frequently during backlog processing

-- 1. First check what cron jobs exist
SELECT jobname, schedule, active 
FROM cron.job 
WHERE jobname LIKE '%worker%'
ORDER BY jobname;

-- 2. Unschedule the existing worker jobs to update them
SELECT cron.unschedule('memory-ingestion-worker-30s');
SELECT cron.unschedule('pattern-detection-worker-1m');
SELECT cron.unschedule('code-ingestion-worker-1m');

-- 3. Create more frequent schedules for catching up
-- Memory ingestion worker - every 10 seconds (temporarily for backlog)
SELECT cron.schedule(
  'memory-ingestion-worker-10s',
  '*/10 * * * * *',
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

-- Pattern detection worker - every 30 seconds
SELECT cron.schedule(
  'pattern-detection-worker-30s',
  '*/30 * * * * *',
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

-- Code ingestion worker - every 30 seconds  
SELECT cron.schedule(
  'code-ingestion-worker-30s',
  '*/30 * * * * *',
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

-- 4. Show the updated schedule
SELECT jobname, schedule, active,
       CASE 
         WHEN jobname LIKE '%10s%' THEN '🚀 FAST (for backlog)'
         WHEN jobname LIKE '%30s%' THEN '⚡ FAST' 
         WHEN jobname LIKE '%1m%' THEN '🐢 NORMAL'
         ELSE '❓'
       END as speed
FROM cron.job 
WHERE jobname LIKE '%worker%'
ORDER BY jobname;