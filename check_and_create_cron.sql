-- First check existing cron jobs
SELECT jobid, schedule, command, nodename, nodeport, database, username, active 
FROM cron.job;

-- Create a cron job to process code queue every 5 minutes
-- This will invoke the process-code edge function
SELECT cron.schedule(
  'process-code-queue-every-5-minutes',
  '*/5 * * * *', -- Every 5 minutes
  $$
  SELECT
    net.http_post(
      url := current_setting('supabase.url') || '/functions/v1/process-code',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('supabase.service_role_key')
      ),
      body := jsonb_build_object(
        'taskId', gen_random_uuid()::text
      )
    ) AS request_id;
  $$
);

-- Verify the cron job was created
SELECT jobid, schedule, command, nodename, nodeport, database, username, active 
FROM cron.job
WHERE jobname = 'process-code-queue-every-5-minutes';
EOF < /dev/null