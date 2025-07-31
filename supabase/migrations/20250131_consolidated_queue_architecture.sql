-- Consolidated Queue Architecture Migration
-- This combines all queue-related changes into a single migration

-- Enable pgmq extension
CREATE EXTENSION IF NOT EXISTS pgmq;

-- Create queues for different processing tasks (safe to run if already exists)
DO $$
BEGIN
    -- Memory ingestion queue
    IF NOT EXISTS (SELECT 1 FROM pgmq.q WHERE queue_name = 'memory_ingestion') THEN
        PERFORM pgmq.create('memory_ingestion');
    END IF;
    
    -- Code ingestion queue
    IF NOT EXISTS (SELECT 1 FROM pgmq.q WHERE queue_name = 'code_ingestion') THEN
        PERFORM pgmq.create('code_ingestion');
    END IF;
    
    -- Pattern detection queue
    IF NOT EXISTS (SELECT 1 FROM pgmq.q WHERE queue_name = 'pattern_detection') THEN
        PERFORM pgmq.create('pattern_detection');
    END IF;
    
    -- Summary generation queue (for future use)
    IF NOT EXISTS (SELECT 1 FROM pgmq.q WHERE queue_name = 'summary_generation') THEN
        PERFORM pgmq.create('summary_generation');
    END IF;
    
    -- Dead letter queues
    IF NOT EXISTS (SELECT 1 FROM pgmq.q WHERE queue_name = 'memory_ingestion_dlq') THEN
        PERFORM pgmq.create('memory_ingestion_dlq');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pgmq.q WHERE queue_name = 'code_ingestion_dlq') THEN
        PERFORM pgmq.create('code_ingestion_dlq');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pgmq.q WHERE queue_name = 'pattern_detection_dlq') THEN
        PERFORM pgmq.create('pattern_detection_dlq');
    END IF;
END $$;

-- Create or replace monitoring view
CREATE OR REPLACE VIEW public.queue_health AS
SELECT 
    queue_name,
    queue_length,
    oldest_msg_age_sec,
    total_messages,
    scrape_time
FROM pgmq.metrics('memory_ingestion')
UNION ALL
SELECT 
    queue_name,
    queue_length,
    oldest_msg_age_sec,
    total_messages,
    scrape_time
FROM pgmq.metrics('code_ingestion')
UNION ALL
SELECT 
    queue_name,
    queue_length,
    oldest_msg_age_sec,
    total_messages,
    scrape_time
FROM pgmq.metrics('pattern_detection')
UNION ALL
SELECT 
    queue_name,
    queue_length,
    oldest_msg_age_sec,
    total_messages,
    scrape_time
FROM pgmq.metrics('summary_generation');

-- Grant permissions for authenticated users to view queue health
GRANT SELECT ON public.queue_health TO authenticated;

-- Create or replace function to send pattern detection jobs WITH workspace support
CREATE OR REPLACE FUNCTION public.queue_pattern_detection_job(
    p_batch_id UUID DEFAULT gen_random_uuid(),
    p_pattern_types TEXT[] DEFAULT ARRAY['debugging', 'learning', 'refactoring', 'temporal', 'semantic', 'memory_code'],
    p_limit INT DEFAULT 100,
    p_workspace_id TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    msg_id BIGINT;
BEGIN
    SELECT pgmq.send(
        queue_name => 'pattern_detection',
        msg => json_build_object(
            'batch_id', p_batch_id,
            'pattern_types', p_pattern_types,
            'limit', p_limit,
            'workspace_id', p_workspace_id,
            'created_at', now()
        )::jsonb
    ) INTO msg_id;
    
    RETURN msg_id;
END;
$$;

-- Create or replace function to send memory ingestion jobs
CREATE OR REPLACE FUNCTION public.queue_memory_ingestion_job(
    p_memory_id UUID,
    p_user_id UUID,
    p_content TEXT,
    p_workspace_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    msg_id BIGINT;
BEGIN
    SELECT pgmq.send(
        queue_name => 'memory_ingestion',
        msg => json_build_object(
            'type', 'memory',
            'memory_id', p_memory_id,
            'user_id', p_user_id,
            'workspace_id', p_workspace_id,
            'content', p_content,
            'metadata', p_metadata,
            'created_at', now()
        )::jsonb
    ) INTO msg_id;
    
    RETURN msg_id;
END;
$$;

-- Create or replace function to send code ingestion jobs
CREATE OR REPLACE FUNCTION public.queue_code_ingestion_job(
    p_code_entity_id UUID,
    p_user_id UUID,
    p_workspace_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    msg_id BIGINT;
BEGIN
    SELECT pgmq.send(
        queue_name => 'code_ingestion',
        msg => json_build_object(
            'type', 'code',
            'code_entity_id', p_code_entity_id,
            'user_id', p_user_id,
            'workspace_id', p_workspace_id,
            'metadata', p_metadata,
            'created_at', now()
        )::jsonb
    ) INTO msg_id;
    
    RETURN msg_id;
END;
$$;

-- Update cron jobs for event-driven pattern detection
-- Remove old pattern detection cron jobs
DO $$
DECLARE
    job_name TEXT;
BEGIN
    -- Remove any old pattern detection scheduling jobs
    FOR job_name IN 
        SELECT jobname FROM cron.job 
        WHERE jobname LIKE '%pattern-detection%' 
           OR jobname LIKE '%queue-pattern-detection%'
           OR jobname LIKE '%schedule-pattern%'
           OR jobname LIKE '%process-pattern-queue%'
           OR jobname LIKE '%process-memory-queue%'
           OR jobname LIKE '%process-code-queue%'
    LOOP
        PERFORM cron.unschedule(job_name);
    END LOOP;
END $$;

-- Schedule workers to process queues (they exit immediately if no work)
-- Memory ingestion worker
SELECT cron.schedule(
  'memory-ingestion-worker',
  '* * * * *', -- Every minute
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/memory-ingestion-worker',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('trigger', 'worker')
  );
  $$
);

-- Code ingestion worker
SELECT cron.schedule(
  'code-ingestion-worker',
  '* * * * *', -- Every minute
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/code-ingestion-worker',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('trigger', 'worker')
  );
  $$
);

-- Pattern detection worker
SELECT cron.schedule(
  'pattern-detection-worker',
  '* * * * *', -- Every minute
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/pattern-detection-worker',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('trigger', 'worker')
  );
  $$
);

-- Add comments
COMMENT ON FUNCTION public.queue_pattern_detection_job IS 'Queue a pattern detection job for a specific workspace';
COMMENT ON FUNCTION public.queue_memory_ingestion_job IS 'Queue a memory for ingestion and processing';
COMMENT ON FUNCTION public.queue_code_ingestion_job IS 'Queue a code entity for ingestion and processing';
COMMENT ON VIEW public.queue_health IS 'Monitor health of all processing queues';
COMMENT ON SCHEMA cron IS 'Event-driven pattern detection: Patterns are detected after ingestion completes or via user API request. Workers process queues every minute but exit immediately if empty.';