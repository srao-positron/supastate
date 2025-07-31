-- GitHub RPC Functions for Queue Management

-- Queue GitHub crawl job function
CREATE OR REPLACE FUNCTION queue_github_crawl(
  p_repository_id UUID,
  p_crawl_type TEXT DEFAULT 'update',
  p_priority INTEGER DEFAULT 10,
  p_data JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
  v_job_id UUID;
BEGIN
  -- Insert into crawl queue table for state tracking
  INSERT INTO github_crawl_queue (
    repository_id,
    crawl_type,
    priority,
    data,
    status,
    created_at
  ) VALUES (
    p_repository_id,
    p_crawl_type,
    p_priority,
    p_data,
    'pending',
    NOW()
  ) RETURNING id INTO v_job_id;
  
  -- Queue in PGMQ for processing
  PERFORM pgmq.send(
    'github_crawl',
    jsonb_build_object(
      'job_id', v_job_id,
      'repository_id', p_repository_id,
      'crawl_type', p_crawl_type,
      'data', p_data
    )
  );
  
  -- Log the queuing
  INSERT INTO github_ingestion_logs (
    repository_id,
    function_name,
    level,
    message,
    metadata
  ) VALUES (
    p_repository_id,
    'queue_github_crawl',
    'info',
    'Queued ' || p_crawl_type || ' crawl job',
    jsonb_build_object('job_id', v_job_id, 'priority', p_priority)
  );
  
  RETURN v_job_id;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION queue_github_crawl TO anon, authenticated, service_role;

-- Queue GitHub code parsing job
CREATE OR REPLACE FUNCTION queue_github_code_parsing(
  p_repository_id UUID,
  p_branch TEXT,
  p_file_path TEXT,
  p_content TEXT,
  p_language TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
  v_message_id BIGINT;
BEGIN
  -- Queue in PGMQ for processing
  SELECT * FROM pgmq.send(
    'github_code_parsing',
    jsonb_build_object(
      'repository_id', p_repository_id,
      'branch', p_branch,
      'file_path', p_file_path,
      'content', p_content,
      'language', p_language,
      'metadata', p_metadata,
      'queued_at', NOW()
    )
  ) INTO v_message_id;
  
  RETURN gen_random_uuid(); -- Return a UUID for consistency
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION queue_github_code_parsing TO anon, authenticated, service_role;

-- Add updated_at trigger to github_crawl_queue if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_github_crawl_queue_updated_at'
  ) THEN
    CREATE TRIGGER update_github_crawl_queue_updated_at
      BEFORE UPDATE ON github_crawl_queue
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;