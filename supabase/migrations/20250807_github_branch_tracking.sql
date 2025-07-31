-- GitHub Branch Tracking Tables
-- This migration creates tables for tracking GitHub branches and their sync status

-- Branch tracking table
CREATE TABLE IF NOT EXISTS public.github_indexed_branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES public.github_repositories(id) ON DELETE CASCADE,
  branch_name VARCHAR(255) NOT NULL,
  base_branch VARCHAR(255),
  
  -- Sync status
  sync_status VARCHAR(50) DEFAULT 'pending', -- pending, syncing, synced, failed
  sync_started_at TIMESTAMP WITH TIME ZONE,
  sync_completed_at TIMESTAMP WITH TIME ZONE,
  sync_error TEXT,
  
  -- Branch metadata
  files_different_from_base INT DEFAULT 0,
  last_commit_sha VARCHAR(40),
  last_commit_date TIMESTAMP WITH TIME ZONE,
  
  -- Source of branch discovery
  source VARCHAR(50) DEFAULT 'manual', -- manual, camille, webhook, discovery
  
  -- Additional metadata
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  indexed_at TIMESTAMP WITH TIME ZONE,
  
  -- Ensure unique branch per repository
  CONSTRAINT github_indexed_branches_unique UNIQUE(repository_id, branch_name)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_github_indexed_branches_repository 
  ON public.github_indexed_branches(repository_id);
  
CREATE INDEX IF NOT EXISTS idx_github_indexed_branches_sync_status 
  ON public.github_indexed_branches(sync_status);
  
CREATE INDEX IF NOT EXISTS idx_github_indexed_branches_source 
  ON public.github_indexed_branches(source);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_github_indexed_branches_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER github_indexed_branches_updated_at
  BEFORE UPDATE ON public.github_indexed_branches
  FOR EACH ROW
  EXECUTE FUNCTION update_github_indexed_branches_updated_at();

-- RLS Policies
ALTER TABLE public.github_indexed_branches ENABLE ROW LEVEL SECURITY;

-- Users can view branches for repositories they have access to
CREATE POLICY "Users can view accessible repository branches"
  ON public.github_indexed_branches
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.github_user_repos
      WHERE github_user_repos.repository_id = github_indexed_branches.repository_id
      AND github_user_repos.user_id = auth.uid()
    )
  );

-- Service role can do everything
CREATE POLICY "Service role has full access to branches"
  ON public.github_indexed_branches
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Add branch_name column to crawl queue if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'github_crawl_queue'
    AND column_name = 'branch_name'
  ) THEN
    ALTER TABLE public.github_crawl_queue 
    ADD COLUMN branch_name VARCHAR(255);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'github_crawl_queue'
    AND column_name = 'crawl_scope'
  ) THEN
    ALTER TABLE public.github_crawl_queue 
    ADD COLUMN crawl_scope VARCHAR(50) DEFAULT 'full'; -- full, delta, specific_files
  END IF;
END $$;