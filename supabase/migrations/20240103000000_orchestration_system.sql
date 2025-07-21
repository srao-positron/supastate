-- Orchestration system for long-running tasks

-- Orchestration jobs table
CREATE TABLE orchestration_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('repo_analysis', 'pr_review', 'pattern_analysis')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  progress JSONB DEFAULT '{"current": 0, "total": 100, "message": "Initializing..."}',
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Orchestration events for real-time updates
CREATE TABLE orchestration_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES orchestration_jobs(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('status_update', 'progress', 'result', 'error', 'log', 'agent_update')),
  content JSONB NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Analysis jobs (specific type of orchestration job)
CREATE TABLE analysis_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  repository TEXT NOT NULL,
  branch TEXT NOT NULL DEFAULT 'main',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  orchestration_job_id UUID REFERENCES orchestration_jobs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX orchestration_jobs_team_idx ON orchestration_jobs(team_id);
CREATE INDEX orchestration_jobs_status_idx ON orchestration_jobs(status);
CREATE INDEX orchestration_jobs_type_idx ON orchestration_jobs(type);
CREATE INDEX orchestration_jobs_created_idx ON orchestration_jobs(created_at DESC);

CREATE INDEX orchestration_events_job_idx ON orchestration_events(job_id, timestamp);
CREATE INDEX orchestration_events_type_idx ON orchestration_events(type);

CREATE INDEX analysis_jobs_team_idx ON analysis_jobs(team_id);
CREATE INDEX analysis_jobs_repo_idx ON analysis_jobs(repository);

-- Enable RLS
ALTER TABLE orchestration_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE orchestration_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their team's orchestration jobs" ON orchestration_jobs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM team_members 
      WHERE team_members.team_id = orchestration_jobs.team_id 
      AND team_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create orchestration jobs for their team" ON orchestration_jobs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members 
      WHERE team_members.team_id = orchestration_jobs.team_id 
      AND team_members.user_id = auth.uid()
      AND team_members.role IN ('owner', 'admin', 'member')
    )
  );

CREATE POLICY "Users can cancel their team's orchestration jobs" ON orchestration_jobs
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM team_members 
      WHERE team_members.team_id = orchestration_jobs.team_id 
      AND team_members.user_id = auth.uid()
      AND team_members.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Users can view events for their team's jobs" ON orchestration_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM orchestration_jobs j
      JOIN team_members tm ON tm.team_id = j.team_id
      WHERE j.id = orchestration_events.job_id
      AND tm.user_id = auth.uid()
    )
  );

-- Function to clean up old events
CREATE OR REPLACE FUNCTION cleanup_old_orchestration_events()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM orchestration_events
  WHERE timestamp < NOW() - INTERVAL '7 days'
  AND job_id IN (
    SELECT id FROM orchestration_jobs
    WHERE status IN ('completed', 'failed', 'cancelled')
  );
END;
$$;

-- Trigger to update updated_at
CREATE TRIGGER update_orchestration_jobs_updated_at BEFORE UPDATE ON orchestration_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();