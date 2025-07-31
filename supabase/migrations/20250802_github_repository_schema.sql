-- GitHub Repository System Schema
-- This migration creates the foundation for storing GitHub repository metadata
-- and managing user access permissions

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Repository registry table
CREATE TABLE IF NOT EXISTS public.github_repositories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id BIGINT UNIQUE NOT NULL,
  owner VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) UNIQUE NOT NULL, -- owner/name format
  private BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  default_branch VARCHAR(255) DEFAULT 'main',
  html_url TEXT NOT NULL,
  clone_url TEXT NOT NULL,
  homepage TEXT,
  language VARCHAR(100),
  topics TEXT[], -- GitHub topics/tags
  
  -- Crawl status tracking
  last_crawled_at TIMESTAMP WITH TIME ZONE,
  crawl_status VARCHAR(50) DEFAULT 'pending', -- pending, crawling, completed, failed
  crawl_error TEXT,
  crawl_started_at TIMESTAMP WITH TIME ZONE,
  crawl_completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Webhook configuration
  webhook_id BIGINT,
  webhook_secret TEXT,
  webhook_installed_at TIMESTAMP WITH TIME ZONE,
  
  -- Repository statistics
  stars_count INT DEFAULT 0,
  forks_count INT DEFAULT 0,
  open_issues_count INT DEFAULT 0,
  size_kb BIGINT,
  
  -- Timestamps from GitHub
  github_created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  github_updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
  github_pushed_at TIMESTAMP WITH TIME ZONE,
  
  -- Our timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT github_repos_owner_name_unique UNIQUE(owner, name)
);

-- User access permissions table
CREATE TABLE IF NOT EXISTS public.github_user_repos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  repository_id UUID NOT NULL REFERENCES public.github_repositories(id) ON DELETE CASCADE,
  permissions TEXT[], -- ['pull', 'push', 'admin', 'maintain', 'triage']
  role VARCHAR(50), -- owner, member, collaborator, outside
  last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT github_user_repos_unique UNIQUE(user_id, repository_id)
);

-- Crawl queue table for asynchronous processing
CREATE TABLE IF NOT EXISTS public.github_crawl_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES public.github_repositories(id) ON DELETE CASCADE,
  crawl_type VARCHAR(50) NOT NULL, -- initial, update, webhook, manual
  priority INT DEFAULT 0, -- Higher priority = processed first
  data JSONB DEFAULT '{}', -- Webhook payload or specific items to update
  
  -- Queue status
  status VARCHAR(50) DEFAULT 'pending', -- pending, processing, completed, failed
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 3,
  error TEXT,
  error_details JSONB,
  
  -- Timing
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  scheduled_for TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Prevent duplicate entries
  CONSTRAINT github_crawl_queue_unique_pending EXCLUDE USING btree (
    repository_id WITH =,
    crawl_type WITH =,
    status WITH =
  ) WHERE (status IN ('pending', 'processing'))
);

-- Crawl history for tracking what was processed
CREATE TABLE IF NOT EXISTS public.github_crawl_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES public.github_repositories(id) ON DELETE CASCADE,
  crawl_type VARCHAR(50) NOT NULL,
  
  -- What was crawled
  entities_processed JSONB DEFAULT '{}', -- {issues: 150, prs: 45, commits: 500, files: 250}
  
  -- Performance metrics
  duration_seconds INT,
  api_calls_made INT,
  rate_limit_remaining INT,
  
  -- Status
  status VARCHAR(50) NOT NULL, -- completed, failed, partial
  error TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_github_repos_full_name ON github_repositories(full_name);
CREATE INDEX IF NOT EXISTS idx_github_repos_crawl_status ON github_repositories(crawl_status);
CREATE INDEX IF NOT EXISTS idx_github_repos_language ON github_repositories(language) WHERE language IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_github_repos_private ON github_repositories(private);

CREATE INDEX IF NOT EXISTS idx_github_user_repos_user ON github_user_repos(user_id);
CREATE INDEX IF NOT EXISTS idx_github_user_repos_repo ON github_user_repos(repository_id);
CREATE INDEX IF NOT EXISTS idx_github_user_repos_last_seen ON github_user_repos(last_seen_at);

CREATE INDEX IF NOT EXISTS idx_github_crawl_queue_status ON github_crawl_queue(status, priority DESC, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_github_crawl_queue_repo ON github_crawl_queue(repository_id);

CREATE INDEX IF NOT EXISTS idx_github_crawl_history_repo ON github_crawl_history(repository_id, created_at DESC);

-- Row Level Security
ALTER TABLE github_repositories ENABLE ROW LEVEL SECURITY;
ALTER TABLE github_user_repos ENABLE ROW LEVEL SECURITY;
ALTER TABLE github_crawl_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE github_crawl_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Repositories: Users can see repos they have access to
CREATE POLICY "Users can view accessible repositories" ON github_repositories
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM github_user_repos
      WHERE github_user_repos.repository_id = github_repositories.id
        AND github_user_repos.user_id = auth.uid()
    )
  );

-- Service role can do everything
CREATE POLICY "Service role full access to repositories" ON github_repositories
  FOR ALL USING (auth.role() = 'service_role');

-- User repos: Users can see their own access records
CREATE POLICY "Users can view own repo access" ON github_user_repos
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Service role full access to user repos" ON github_user_repos
  FOR ALL USING (auth.role() = 'service_role');

-- Crawl queue: Service role only
CREATE POLICY "Service role full access to crawl queue" ON github_crawl_queue
  FOR ALL USING (auth.role() = 'service_role');

-- Crawl history: Users can see history for their accessible repos
CREATE POLICY "Users can view crawl history for accessible repos" ON github_crawl_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM github_user_repos
      WHERE github_user_repos.repository_id = github_crawl_history.repository_id
        AND github_user_repos.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access to crawl history" ON github_crawl_history
  FOR ALL USING (auth.role() = 'service_role');

-- Functions for queue management

-- Function to queue a repository for crawling
CREATE OR REPLACE FUNCTION queue_github_crawl(
  p_repository_id UUID,
  p_crawl_type VARCHAR DEFAULT 'initial',
  p_priority INT DEFAULT 0,
  p_data JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_queue_id UUID;
BEGIN
  -- Insert or update existing pending entry
  INSERT INTO github_crawl_queue (
    repository_id,
    crawl_type,
    priority,
    data,
    status,
    scheduled_for
  ) VALUES (
    p_repository_id,
    p_crawl_type,
    p_priority,
    p_data,
    'pending',
    NOW()
  )
  ON CONFLICT (repository_id, crawl_type, status) 
  WHERE status IN ('pending', 'processing')
  DO UPDATE SET
    priority = GREATEST(github_crawl_queue.priority, EXCLUDED.priority),
    data = github_crawl_queue.data || EXCLUDED.data,
    updated_at = NOW()
  RETURNING id INTO v_queue_id;
  
  RETURN v_queue_id;
END;
$$;

-- Function to get user's accessible repositories
CREATE OR REPLACE FUNCTION get_user_github_repositories(p_user_id UUID)
RETURNS TABLE (
  repository_id UUID,
  full_name VARCHAR,
  permissions TEXT[],
  last_crawled_at TIMESTAMP WITH TIME ZONE,
  crawl_status VARCHAR
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT 
    r.id as repository_id,
    r.full_name,
    ur.permissions,
    r.last_crawled_at,
    r.crawl_status
  FROM github_repositories r
  INNER JOIN github_user_repos ur ON ur.repository_id = r.id
  WHERE ur.user_id = p_user_id
  ORDER BY ur.last_seen_at DESC;
$$;

-- Trigger to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_github_repositories_updated_at
  BEFORE UPDATE ON github_repositories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_github_user_repos_updated_at
  BEFORE UPDATE ON github_user_repos
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();