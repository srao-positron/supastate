-- Add content_hash to memory_queue for deduplication
ALTER TABLE IF EXISTS memory_queue 
ADD COLUMN IF NOT EXISTS content_hash TEXT;

-- Create index for efficient duplicate checking
CREATE INDEX IF NOT EXISTS idx_memory_queue_hash 
ON memory_queue(workspace_id, content_hash);

-- Create a composite index for efficient duplicate checking
CREATE INDEX IF NOT EXISTS idx_memory_queue_dedup 
ON memory_queue(workspace_id, chunk_id);

-- Add a table to track processed memories to prevent reprocessing
CREATE TABLE IF NOT EXISTS processed_memories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id TEXT NOT NULL,
  project_name TEXT NOT NULL,
  chunk_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  neo4j_node_id TEXT,
  UNIQUE(workspace_id, project_name, chunk_id)
);

-- Create index for hash lookups
CREATE INDEX IF NOT EXISTS idx_processed_memories_hash 
ON processed_memories(workspace_id, project_name, content_hash);

-- Enable RLS
ALTER TABLE processed_memories ENABLE ROW LEVEL SECURITY;

-- RLS policies for processed_memories
CREATE POLICY "Users can view their own processed memories" ON processed_memories
  FOR SELECT USING (
    workspace_id = 'user:' || auth.uid() OR
    workspace_id IN (
      SELECT 'team:' || team_id::text 
      FROM team_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role has full access to processed memories" ON processed_memories
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');