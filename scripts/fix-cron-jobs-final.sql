-- Fix cron jobs to use the new queue workers

-- 1. First disable the old jobs that are failing
UPDATE cron.job SET active = false WHERE jobname IN ('process-memory-queue', 'process-code-queue');

-- 2. Create new cron jobs for the queue workers (if they don't exist)
DO $$
BEGIN
  -- Check if memory-ingestion-worker-30s exists
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'memory-ingestion-worker-30s') THEN
    PERFORM cron.schedule(
      'memory-ingestion-worker-30s',
      '*/30 * * * * *',
      $cmd$
      SELECT net.http_post(
        url := 'https://zqlfxakbkwssxfynrmnk.supabase.co/functions/v1/memory-ingestion-worker',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxbGZ4YWtia3dzc3hmeW5ybW5rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzEyNDMxMiwiZXhwIjoyMDY4NzAwMzEyfQ.Dvvga6Y4vu7xtorjzgQ3B4kjoJYvISQcnOEAIuoFSOU'
        ),
        body := jsonb_build_object('trigger', 'cron')
      );
      $cmd$
    );
    RAISE NOTICE 'Created memory-ingestion-worker-30s cron job';
  END IF;

  -- Check if pattern-detection-worker-1m exists
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pattern-detection-worker-1m') THEN
    PERFORM cron.schedule(
      'pattern-detection-worker-1m',
      '* * * * *',
      $cmd$
      SELECT net.http_post(
        url := 'https://zqlfxakbkwssxfynrmnk.supabase.co/functions/v1/pattern-detection-worker',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxbGZ4YWtia3dzc3hmeW5ybW5rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzEyNDMxMiwiZXhwIjoyMDY4NzAwMzEyfQ.Dvvga6Y4vu7xtorjzgQ3B4kjoJYvISQcnOEAIuoFSOU'
        ),
        body := jsonb_build_object('trigger', 'cron')
      );
      $cmd$
    );
    RAISE NOTICE 'Created pattern-detection-worker-1m cron job';
  END IF;

  -- Check if code-ingestion-worker-1m exists
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'code-ingestion-worker-1m') THEN
    PERFORM cron.schedule(
      'code-ingestion-worker-1m',
      '* * * * *',
      $cmd$
      SELECT net.http_post(
        url := 'https://zqlfxakbkwssxfynrmnk.supabase.co/functions/v1/code-ingestion-worker',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxbGZ4YWtia3dzc3hmeW5ybW5rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzEyNDMxMiwiZXhwIjoyMDY4NzAwMzEyfQ.Dvvga6Y4vu7xtorjzgQ3B4kjoJYvISQcnOEAIuoFSOU'
        ),
        body := jsonb_build_object('trigger', 'cron')
      );
      $cmd$
    );
    RAISE NOTICE 'Created code-ingestion-worker-1m cron job';
  END IF;
END $$;

-- 3. Create the missing code_ingestion queue if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pgmq.meta WHERE queue_name = 'code_ingestion') THEN
    PERFORM pgmq.create('code_ingestion');
    RAISE NOTICE 'Created code_ingestion queue';
  END IF;
END $$;

-- 4. View the current state
SELECT jobname, schedule, active, 
       CASE 
         WHEN command LIKE '%memory-ingestion-worker%' THEN '✅ NEW Worker'
         WHEN command LIKE '%pattern-detection-worker%' THEN '✅ NEW Worker'
         WHEN command LIKE '%code-ingestion-worker%' THEN '✅ NEW Worker'
         WHEN command LIKE '%enhanced-process-neo4j%' THEN '❌ OLD Function (disabled)'
         WHEN command LIKE '%schedule-code-processing%' THEN '❌ OLD Function'
         WHEN command LIKE '%process-code%' THEN '❌ OLD Function (disabled)'
         WHEN command LIKE '%process-embeddings%' THEN '📊 Embeddings'
         WHEN command LIKE '%generate-project-summaries%' THEN '📊 Summaries'
         ELSE '❓ Other'
       END as status,
       CASE WHEN active THEN '🟢' ELSE '🔴' END as active_status
FROM cron.job 
ORDER BY active DESC, jobname;