-- GitHub Activity Logging Function

CREATE OR REPLACE FUNCTION log_github_activity(
  p_function_name TEXT,
  p_level TEXT,
  p_message TEXT,
  p_details JSONB DEFAULT '{}'::jsonb,
  p_repository_id UUID DEFAULT NULL,
  p_repository_full_name TEXT DEFAULT NULL,
  p_job_id UUID DEFAULT NULL,
  p_error_code TEXT DEFAULT NULL,
  p_error_stack TEXT DEFAULT NULL,
  p_duration_ms INTEGER DEFAULT NULL,
  p_api_calls_count INTEGER DEFAULT NULL,
  p_entities_processed JSONB DEFAULT NULL,
  p_github_rate_limit_remaining INTEGER DEFAULT NULL,
  p_github_rate_limit_reset TIMESTAMPTZ DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO github_ingestion_logs (
    function_name,
    level,
    message,
    metadata,
    repository_id,
    created_at
  ) VALUES (
    p_function_name,
    p_level,
    p_message,
    jsonb_build_object(
      'details', p_details,
      'repository_full_name', p_repository_full_name,
      'job_id', p_job_id,
      'error_code', p_error_code,
      'error_stack', p_error_stack,
      'duration_ms', p_duration_ms,
      'api_calls_count', p_api_calls_count,
      'entities_processed', p_entities_processed,
      'github_rate_limit_remaining', p_github_rate_limit_remaining,
      'github_rate_limit_reset', p_github_rate_limit_reset
    ),
    p_repository_id,
    NOW()
  ) RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION log_github_activity TO anon, authenticated, service_role;