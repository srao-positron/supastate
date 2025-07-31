-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant usage to postgres user
GRANT USAGE ON SCHEMA cron TO postgres;

-- Schedule pattern detection to run every 5 minutes
SELECT cron.schedule(
  'pattern-detection-5min',
  '*/5 * * * *', -- Every 5 minutes
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/schedule-pattern-detection',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('trigger', 'cron')
  );
  $$
);

-- Schedule memory processing to run every 2 minutes
SELECT cron.schedule(
  'process-memory-queue',
  '*/2 * * * *', -- Every 2 minutes
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/enhanced-process-neo4j',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('trigger', 'cron')
  );
  $$
);

-- Schedule code processing to run every 3 minutes
SELECT cron.schedule(
  'process-code-queue',
  '*/3 * * * *', -- Every 3 minutes
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/process-code',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('trigger', 'cron')
  );
  $$
);

-- View scheduled jobs
SELECT * FROM cron.job;

-- To unschedule jobs (commented out, run manually if needed):
-- SELECT cron.unschedule('pattern-detection-5min');
-- SELECT cron.unschedule('process-memory-queue');
-- SELECT cron.unschedule('process-code-queue');