-- Create code_processing_queue table for managing code file processing
CREATE TABLE IF NOT EXISTS code_processing_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL,
  file_path TEXT NOT NULL,
  content TEXT NOT NULL,
  language TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  project_name TEXT NOT NULL,
  git_metadata JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error TEXT,
  retry_count INTEGER DEFAULT 0,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_code_queue_task_status ON code_processing_queue(task_id, status);
CREATE INDEX IF NOT EXISTS idx_code_queue_workspace ON code_processing_queue(workspace_id, project_name);
CREATE INDEX IF NOT EXISTS idx_code_queue_status_created ON code_processing_queue(status, created_at);

-- Create code_files table to track processed files
CREATE TABLE IF NOT EXISTS code_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  path TEXT NOT NULL,
  project_name TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  language TEXT NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  size INTEGER NOT NULL,
  line_count INTEGER NOT NULL,
  git_metadata JSONB,
  neo4j_file_id UUID,
  last_processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(workspace_id, project_name, path)
);

-- Indexes for code_files
CREATE INDEX IF NOT EXISTS idx_code_files_workspace_project ON code_files(workspace_id, project_name);
CREATE INDEX IF NOT EXISTS idx_code_files_path ON code_files(path);
CREATE INDEX IF NOT EXISTS idx_code_files_hash ON code_files(content_hash);

-- Create code_processing_tasks table to track overall tasks
CREATE TABLE IF NOT EXISTS code_processing_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id TEXT NOT NULL,
  project_name TEXT NOT NULL,
  total_files INTEGER NOT NULL DEFAULT 0,
  processed_files INTEGER NOT NULL DEFAULT 0,
  failed_files INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create function to update task progress
CREATE OR REPLACE FUNCTION update_code_processing_task_progress()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the task progress when queue items change status
  UPDATE code_processing_tasks
  SET 
    processed_files = (
      SELECT COUNT(*) 
      FROM code_processing_queue 
      WHERE task_id = NEW.task_id AND status = 'completed'
    ),
    failed_files = (
      SELECT COUNT(*) 
      FROM code_processing_queue 
      WHERE task_id = NEW.task_id AND status = 'failed'
    ),
    status = CASE
      WHEN (
        SELECT COUNT(*) 
        FROM code_processing_queue 
        WHERE task_id = NEW.task_id AND status IN ('pending', 'processing')
      ) = 0 THEN 'completed'
      ELSE 'processing'
    END,
    completed_at = CASE
      WHEN (
        SELECT COUNT(*) 
        FROM code_processing_queue 
        WHERE task_id = NEW.task_id AND status IN ('pending', 'processing')
      ) = 0 THEN now()
      ELSE NULL
    END,
    updated_at = now()
  WHERE id = NEW.task_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updating task progress
CREATE TRIGGER update_task_progress_trigger
AFTER UPDATE OF status ON code_processing_queue
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION update_code_processing_task_progress();

-- Enable RLS
ALTER TABLE code_processing_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE code_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE code_processing_tasks ENABLE ROW LEVEL SECURITY;

-- RLS policies for code_processing_queue
CREATE POLICY "Service role can manage code_processing_queue" ON code_processing_queue
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Users can view their own code processing queue" ON code_processing_queue
  FOR SELECT USING (
    workspace_id = COALESCE('team:' || (auth.jwt()->>'team_id'), 'user:' || auth.uid()::text)
  );

-- RLS policies for code_files
CREATE POLICY "Service role can manage code_files" ON code_files
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Users can view their own code files" ON code_files
  FOR SELECT USING (
    workspace_id = COALESCE('team:' || (auth.jwt()->>'team_id'), 'user:' || auth.uid()::text)
  );

-- RLS policies for code_processing_tasks
CREATE POLICY "Service role can manage code_processing_tasks" ON code_processing_tasks
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Users can view their own code processing tasks" ON code_processing_tasks
  FOR SELECT USING (
    workspace_id = COALESCE('team:' || (auth.jwt()->>'team_id'), 'user:' || auth.uid()::text)
  );