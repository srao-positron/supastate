-- Queue tables for server-side processing

-- Memory ingestion queue
CREATE TABLE IF NOT EXISTS memory_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  chunk_id TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error TEXT,
  retry_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ,
  UNIQUE(workspace_id, chunk_id)
);

-- Code ingestion queue
CREATE TABLE IF NOT EXISTS code_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  content TEXT NOT NULL,
  language TEXT,
  metadata JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error TEXT,
  retry_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ,
  UNIQUE(workspace_id, file_path)
);

-- Indexes for efficient processing
CREATE INDEX idx_memory_queue_status ON memory_queue(status) WHERE status = 'pending';
CREATE INDEX idx_memory_queue_workspace ON memory_queue(workspace_id);
CREATE INDEX idx_memory_queue_session ON memory_queue(session_id);
CREATE INDEX idx_memory_queue_created ON memory_queue(created_at);

CREATE INDEX idx_code_queue_status ON code_queue(status) WHERE status = 'pending';
CREATE INDEX idx_code_queue_workspace ON code_queue(workspace_id);
CREATE INDEX idx_code_queue_created ON code_queue(created_at);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_memory_queue_updated_at BEFORE UPDATE ON memory_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_code_queue_updated_at BEFORE UPDATE ON code_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Processing status tracking
CREATE TABLE IF NOT EXISTS processing_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  queue_type TEXT NOT NULL CHECK (queue_type IN ('memory', 'code')),
  total_items INT NOT NULL DEFAULT 0,
  processed_items INT NOT NULL DEFAULT 0,
  failed_items INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'failed')),
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_processing_status_workspace ON processing_status(workspace_id);
CREATE INDEX idx_processing_status_active ON processing_status(status) WHERE status = 'active';

-- Grant permissions
GRANT ALL ON memory_queue TO authenticated;
GRANT ALL ON code_queue TO authenticated;
GRANT ALL ON processing_status TO authenticated;

-- RLS policies
ALTER TABLE memory_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE code_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_status ENABLE ROW LEVEL SECURITY;

-- Memory queue policies
CREATE POLICY "memory_queue_insert" ON memory_queue
  FOR INSERT
  WITH CHECK (true); -- API key authenticated users can insert

CREATE POLICY "memory_queue_select" ON memory_queue
  FOR SELECT
  USING (
    workspace_id = 'user:' || auth.uid()::text OR
    workspace_id IN (
      SELECT 'team:' || team_id::text
      FROM team_members
      WHERE user_id = auth.uid()
    )
  );

-- Code queue policies
CREATE POLICY "code_queue_insert" ON code_queue
  FOR INSERT
  WITH CHECK (true); -- API key authenticated users can insert

CREATE POLICY "code_queue_select" ON code_queue
  FOR SELECT
  USING (
    workspace_id = 'user:' || auth.uid()::text OR
    workspace_id IN (
      SELECT 'team:' || team_id::text
      FROM team_members
      WHERE user_id = auth.uid()
    )
  );

-- Processing status policies
CREATE POLICY "processing_status_all" ON processing_status
  FOR ALL
  USING (
    workspace_id = 'user:' || auth.uid()::text OR
    workspace_id IN (
      SELECT 'team:' || team_id::text
      FROM team_members
      WHERE user_id = auth.uid()
    )
  );