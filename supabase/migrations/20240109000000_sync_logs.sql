-- Create sync_logs table for tracking sync operations
CREATE TABLE IF NOT EXISTS sync_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace TEXT NOT NULL, -- 'team:uuid' or 'user:uuid'
  project_name TEXT NOT NULL,
  sync_type TEXT NOT NULL, -- 'memory', 'batch_memory', 'graph', etc
  status TEXT NOT NULL, -- 'completed', 'partial', 'failed'
  chunks_synced INTEGER DEFAULT 0,
  chunks_failed INTEGER DEFAULT 0,
  duration_ms INTEGER,
  metadata JSONB DEFAULT '{}',
  completed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX idx_sync_logs_workspace ON sync_logs(workspace);
CREATE INDEX idx_sync_logs_project ON sync_logs(project_name);
CREATE INDEX idx_sync_logs_created_at ON sync_logs(created_at DESC);
CREATE INDEX idx_sync_logs_metadata_session ON sync_logs((metadata->>'syncSessionId')) 
  WHERE metadata->>'syncSessionId' IS NOT NULL;

-- Enable RLS
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for sync_logs
CREATE POLICY "Users can view their own sync logs"
  ON sync_logs FOR SELECT
  TO authenticated
  USING (
    workspace = 'user:' || auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM team_members 
      WHERE team_members.user_id = auth.uid() 
      AND workspace = 'team:' || team_members.team_id::text
    )
  );

CREATE POLICY "Service role has full access to sync logs"
  ON sync_logs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Function to clean up old sync logs (keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_sync_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM sync_logs 
  WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;