-- Add GitHub installation tracking to teams
ALTER TABLE teams ADD COLUMN github_installation_id INTEGER UNIQUE;
ALTER TABLE teams ADD COLUMN github_installation_data JSONB;

-- Index for quick lookups by installation
CREATE INDEX teams_github_installation_idx ON teams(github_installation_id) WHERE github_installation_id IS NOT NULL;

-- Add GitHub-specific fields to review sessions
ALTER TABLE review_sessions ADD COLUMN github_check_run_id BIGINT;
ALTER TABLE review_sessions ADD COLUMN github_installation_id INTEGER;

-- Track GitHub App installations
CREATE TABLE github_installations (
  id INTEGER PRIMARY KEY, -- GitHub's installation ID
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  account_name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('User', 'Organization')),
  repository_selection TEXT NOT NULL CHECK (repository_selection IN ('all', 'selected')),
  repositories JSONB, -- List of accessible repositories
  permissions JSONB, -- App permissions
  events TEXT[], -- Subscribed events
  installed_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE github_installations ENABLE ROW LEVEL SECURITY;

-- RLS Policy
CREATE POLICY "Team members can view their GitHub installations" ON github_installations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM team_members 
      WHERE team_members.team_id = github_installations.team_id 
      AND team_members.user_id = auth.uid()
    )
  );