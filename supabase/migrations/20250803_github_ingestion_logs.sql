-- GitHub Ingestion Logs Table
-- This table tracks all GitHub crawling and ingestion activities

CREATE TABLE IF NOT EXISTS public.github_ingestion_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Context
  function_name VARCHAR(100) NOT NULL, -- github-crawl-coordinator, github-crawl-worker, etc.
  repository_id UUID REFERENCES public.github_repositories(id) ON DELETE SET NULL,
  repository_full_name VARCHAR(255), -- Store separately for easier debugging
  job_id UUID REFERENCES public.github_crawl_queue(id) ON DELETE SET NULL,
  
  -- Log details
  level VARCHAR(20) NOT NULL CHECK (level IN ('debug', 'info', 'warning', 'error', 'fatal')),
  message TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  
  -- Error tracking
  error_code VARCHAR(50),
  error_stack TEXT,
  
  -- Performance metrics
  duration_ms INT,
  api_calls_count INT,
  entities_processed JSONB, -- {issues: 50, commits: 100, etc.}
  
  -- Rate limit info
  github_rate_limit_remaining INT,
  github_rate_limit_reset TIMESTAMP WITH TIME ZONE,
  
  -- Timestamps
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_github_logs_timestamp ON github_ingestion_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_github_logs_repository ON github_ingestion_logs(repository_id) WHERE repository_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_github_logs_job ON github_ingestion_logs(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_github_logs_level ON github_ingestion_logs(level) WHERE level IN ('error', 'fatal');
CREATE INDEX IF NOT EXISTS idx_github_logs_function ON github_ingestion_logs(function_name);
CREATE INDEX IF NOT EXISTS idx_github_logs_repo_name ON github_ingestion_logs(repository_full_name) WHERE repository_full_name IS NOT NULL;

-- Row Level Security
ALTER TABLE github_ingestion_logs ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "Service role full access to github logs" ON github_ingestion_logs
  FOR ALL USING (auth.role() = 'service_role');

-- Users can view logs for their accessible repositories
CREATE POLICY "Users can view logs for accessible repos" ON github_ingestion_logs
  FOR SELECT USING (
    repository_id IS NULL OR
    EXISTS (
      SELECT 1 FROM github_user_repos
      WHERE github_user_repos.repository_id = github_ingestion_logs.repository_id
        AND github_user_repos.user_id = auth.uid()
    )
  );

-- Helper function to log GitHub activities
CREATE OR REPLACE FUNCTION log_github_activity(
  p_function_name VARCHAR,
  p_level VARCHAR,
  p_message TEXT,
  p_details JSONB DEFAULT '{}',
  p_repository_id UUID DEFAULT NULL,
  p_repository_full_name VARCHAR DEFAULT NULL,
  p_job_id UUID DEFAULT NULL,
  p_error_code VARCHAR DEFAULT NULL,
  p_error_stack TEXT DEFAULT NULL,
  p_duration_ms INT DEFAULT NULL,
  p_api_calls_count INT DEFAULT NULL,
  p_entities_processed JSONB DEFAULT NULL,
  p_github_rate_limit_remaining INT DEFAULT NULL,
  p_github_rate_limit_reset TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO github_ingestion_logs (
    function_name,
    level,
    message,
    details,
    repository_id,
    repository_full_name,
    job_id,
    error_code,
    error_stack,
    duration_ms,
    api_calls_count,
    entities_processed,
    github_rate_limit_remaining,
    github_rate_limit_reset
  ) VALUES (
    p_function_name,
    p_level,
    p_message,
    p_details,
    p_repository_id,
    p_repository_full_name,
    p_job_id,
    p_error_code,
    p_error_stack,
    p_duration_ms,
    p_api_calls_count,
    p_entities_processed,
    p_github_rate_limit_remaining,
    p_github_rate_limit_reset
  ) RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION log_github_activity TO authenticated;
GRANT EXECUTE ON FUNCTION log_github_activity TO service_role;