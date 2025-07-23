-- Enable pg_cron extension for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant usage to postgres user
GRANT USAGE ON SCHEMA cron TO postgres;

-- Function to trigger Edge Function
CREATE OR REPLACE FUNCTION trigger_embedding_processing()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  pending_count INTEGER;
BEGIN
  -- Check if there are pending items
  SELECT COUNT(*) INTO pending_count
  FROM memory_queue
  WHERE status = 'pending';
  
  IF pending_count > 0 THEN
    -- Call Edge Function
    PERFORM
      net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/process-embeddings',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object('trigger', 'cron')
      );
  END IF;
END;
$$;

-- Schedule the job to run every 10 seconds
SELECT cron.schedule(
  'process-embeddings',
  '*/10 * * * * *', -- Every 10 seconds
  'SELECT trigger_embedding_processing();'
);

-- Alternative: Use database triggers for instant processing
CREATE OR REPLACE FUNCTION notify_new_queue_items()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Send notification when new items are added
  PERFORM pg_notify('new_queue_items', json_build_object(
    'table', TG_TABLE_NAME,
    'count', 1
  )::text);
  
  -- If we have enough items, trigger processing immediately
  IF (SELECT COUNT(*) FROM memory_queue WHERE status = 'pending') >= 10 THEN
    PERFORM trigger_embedding_processing();
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create triggers
CREATE TRIGGER memory_queue_notify
  AFTER INSERT ON memory_queue
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_queue_items();

CREATE TRIGGER code_queue_notify
  AFTER INSERT ON code_queue
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_queue_items();