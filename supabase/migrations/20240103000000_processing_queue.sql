-- Processing queue for raw memory chunks
CREATE TABLE IF NOT EXISTS memory_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  chunk_id TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  UNIQUE(workspace_id, chunk_id)
);

-- Processing queue for code files
CREATE TABLE IF NOT EXISTS code_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  project_path TEXT NOT NULL,
  file_path TEXT NOT NULL,
  content TEXT NOT NULL,
  language TEXT,
  metadata JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  UNIQUE(workspace_id, project_path, file_path)
);

-- Indexes for efficient queue processing
CREATE INDEX idx_memory_queue_status ON memory_queue(status, created_at) WHERE status = 'pending';
CREATE INDEX idx_code_queue_status ON code_queue(status, created_at) WHERE status = 'pending';
CREATE INDEX idx_memory_queue_workspace ON memory_queue(workspace_id);
CREATE INDEX idx_code_queue_workspace ON code_queue(workspace_id);

-- Function to get next items from queue
CREATE OR REPLACE FUNCTION get_pending_memory_chunks(batch_size INTEGER DEFAULT 10)
RETURNS TABLE (
  id UUID,
  workspace_id TEXT,
  session_id TEXT,
  chunk_id TEXT,
  content TEXT,
  metadata JSONB
) AS $$
BEGIN
  RETURN QUERY
  UPDATE memory_queue
  SET status = 'processing',
      processed_at = NOW()
  WHERE id IN (
    SELECT id
    FROM memory_queue
    WHERE status = 'pending'
      AND retry_count < 3
    ORDER BY created_at
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING id, workspace_id, session_id, chunk_id, content, metadata;
END;
$$ LANGUAGE plpgsql;

-- Add processing status to memories table
ALTER TABLE memories ADD COLUMN IF NOT EXISTS processing_status TEXT DEFAULT 'completed';
ALTER TABLE memories ADD COLUMN IF NOT EXISTS queue_id UUID REFERENCES memory_queue(id);

-- Add processing status to code_objects table  
ALTER TABLE code_objects ADD COLUMN IF NOT EXISTS processing_status TEXT DEFAULT 'completed';
ALTER TABLE code_objects ADD COLUMN IF NOT EXISTS queue_id UUID REFERENCES code_queue(id);

-- RLS policies for queue tables
ALTER TABLE memory_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE code_queue ENABLE ROW LEVEL SECURITY;

-- Only allow access to own workspace data
CREATE POLICY "Users can view own memory queue items" ON memory_queue
  FOR SELECT USING (
    workspace_id = COALESCE(
      'team:' || auth.jwt() ->> 'team_id',
      'user:' || auth.uid()::text
    )
  );

CREATE POLICY "Users can insert own memory queue items" ON memory_queue
  FOR INSERT WITH CHECK (
    workspace_id = COALESCE(
      'team:' || auth.jwt() ->> 'team_id',
      'user:' || auth.uid()::text
    )
  );

CREATE POLICY "Service role can manage all memory queue items" ON memory_queue
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');