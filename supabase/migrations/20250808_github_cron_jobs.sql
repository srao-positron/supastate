-- GitHub Cron Jobs
-- Schedule GitHub crawl coordinator to run every minute

-- Ensure pg_cron is enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant usage to postgres user
GRANT USAGE ON SCHEMA cron TO postgres;

-- Schedule GitHub crawl coordinator to run every minute
SELECT cron.schedule(
  'github-crawl-coordinator',
  '* * * * *', -- Every minute
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/github-crawl-coordinator',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('trigger', 'cron')
  );
  $$
);

-- Schedule GitHub code parser worker to run every minute
SELECT cron.schedule(
  'github-code-parser-worker',
  '* * * * *', -- Every minute
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/github-code-parser-worker',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('trigger', 'cron', 'batch_size', 10)
  );
  $$
);

-- Add comment to track what these jobs do
COMMENT ON EXTENSION pg_cron IS 'GitHub crawl jobs: github-crawl-coordinator processes crawl queue, github-code-parser-worker parses code files';

-- View all scheduled jobs
SELECT 
  jobid,
  jobname,
  schedule,
  command,
  nodename,
  nodeport,
  database,
  username,
  active
FROM cron.job
WHERE jobname LIKE '%github%'
ORDER BY jobid;