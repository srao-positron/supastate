-- Remove old cron jobs that we're replacing
SELECT cron.unschedule('memory-ingestion-worker-30s');
SELECT cron.unschedule('code-ingestion-worker-1m');
SELECT cron.unschedule('pattern-detection-worker-1m');

-- Also remove the old process jobs that are no longer needed
SELECT cron.unschedule('process-embeddings-every-minute');
SELECT cron.unschedule('process-code-queue-every-5-minutes');

-- Create new cron jobs for coordinators
-- Memory ingestion coordinator - runs every 30 seconds
SELECT cron.schedule(
  'memory-ingestion-coordinator-30s',
  '* * * * *', -- Every minute (can't do sub-minute with pg_cron)
  $$
  SELECT net.http_post(
    url := 'https://zqlfxakbkwssxfynrmnk.supabase.co/functions/v1/memory-ingestion-coordinator',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxbGZ4YWtia3dzc3hmeW5ybW5rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzEyNDMxMiwiZXhwIjoyMDY4NzAwMzEyfQ.Dvvga6Y4vu7xtorjzgQ3B4kjoJYvISQcnOEAIuoFSOU'
    ),
    body := jsonb_build_object('trigger', 'cron')
  );
  $$
);

-- Code ingestion coordinator - runs every minute
SELECT cron.schedule(
  'code-ingestion-coordinator-1m',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://zqlfxakbkwssxfynrmnk.supabase.co/functions/v1/code-ingestion-coordinator',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxbGZ4YWtia3dzc3hmeW5ybW5rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzEyNDMxMiwiZXhwIjoyMDY4NzAwMzEyfQ.Dvvga6Y4vu7xtorjzgQ3B4kjoJYvISQcnOEAIuoFSOU'
    ),
    body := jsonb_build_object('trigger', 'cron')
  );
  $$
);

-- Pattern detection coordinator - runs every 2 minutes (less frequent as it's more intensive)
SELECT cron.schedule(
  'pattern-detection-coordinator-2m',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://zqlfxakbkwssxfynrmnk.supabase.co/functions/v1/pattern-detection-coordinator',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxbGZ4YWtia3dzc3hmeW5ybW5rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzEyNDMxMiwiZXhwIjoyMDY4NzAwMzEyfQ.Dvvga6Y4vu7xtorjzgQ3B4kjoJYvISQcnOEAIuoFSOU'
    ),
    body := jsonb_build_object('trigger', 'cron')
  );
  $$
);