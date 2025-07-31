-- GitHub Repository Processing Cron Jobs
-- This migration sets up scheduled jobs for GitHub repository processing

-- Create cron job to process GitHub crawl queue
SELECT cron.schedule(
  'process-github-crawl-queue',
  '*/5 * * * *', -- Every 5 minutes
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

-- Create cron job to update repository metadata daily
SELECT cron.schedule(
  'update-github-repositories',
  '0 2 * * *', -- Daily at 2 AM
  $$
  -- Queue updates for repositories that haven't been updated in 24 hours
  INSERT INTO github_crawl_queue (repository_id, crawl_type, priority)
  SELECT 
    id,
    'update',
    5
  FROM github_repositories
  WHERE crawl_status = 'completed'
    AND last_crawled_at < NOW() - INTERVAL '24 hours'
  ON CONFLICT (repository_id, crawl_type, status) 
  WHERE status IN ('pending', 'processing')
  DO NOTHING;
  $$
);

-- Create cron job to clean up old crawl history
SELECT cron.schedule(
  'cleanup-github-crawl-history',
  '0 3 * * 0', -- Weekly on Sunday at 3 AM
  $$
  -- Delete crawl history older than 30 days
  DELETE FROM github_crawl_history
  WHERE created_at < NOW() - INTERVAL '30 days';
  
  -- Delete old logs
  DELETE FROM github_ingestion_logs
  WHERE timestamp < NOW() - INTERVAL '7 days'
    AND level NOT IN ('error', 'fatal');
  $$
);

-- Create cron job to check webhook health
SELECT cron.schedule(
  'check-github-webhook-health',
  '0 */6 * * *', -- Every 6 hours
  $$
  -- Queue repositories with webhooks for health check
  INSERT INTO github_crawl_queue (repository_id, crawl_type, priority, data)
  SELECT 
    id,
    'webhook',
    3,
    jsonb_build_object('action', 'health_check')
  FROM github_repositories
  WHERE webhook_id IS NOT NULL
    AND (webhook_installed_at < NOW() - INTERVAL '7 days' 
         OR crawl_status = 'failed')
  ON CONFLICT (repository_id, crawl_type, status) 
  WHERE status IN ('pending', 'processing')
  DO NOTHING;
  $$
);

-- Grant necessary permissions
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT EXECUTE ON FUNCTION cron.schedule TO postgres;