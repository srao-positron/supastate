-- Create PGMQ queue for GitHub code parsing
-- This follows the existing pattern used by code_ingestion and pattern_detection queues

-- Create the queue
SELECT pgmq.create('github_code_parsing');

-- Grant permissions to use the queue
GRANT USAGE ON SCHEMA pgmq TO postgres, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pgmq TO service_role;

-- Create function to queue GitHub files for parsing
CREATE OR REPLACE FUNCTION public.queue_github_code_parsing(
  p_repository_id UUID,
  p_file_id TEXT,
  p_file_path TEXT,
  p_file_content TEXT,
  p_language TEXT,
  p_branch TEXT DEFAULT 'main',
  p_commit_sha TEXT DEFAULT NULL
) RETURNS BIGINT AS $$
DECLARE
  msg_id BIGINT;
BEGIN
  -- Only queue supported languages
  IF p_language NOT IN ('ts', 'tsx', 'js', 'jsx', 'py', 'go', 'java', 'rs') THEN
    RETURN NULL;
  END IF;
  
  -- Queue the message
  SELECT pgmq.send(
    'github_code_parsing',
    jsonb_build_object(
      'repository_id', p_repository_id,
      'file_id', p_file_id,
      'file_path', p_file_path,
      'file_content', p_file_content,
      'language', p_language,
      'branch', p_branch,
      'commit_sha', p_commit_sha,
      'timestamp', NOW()
    )
  ) INTO msg_id;
  
  RETURN msg_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.queue_github_code_parsing TO service_role, authenticated;