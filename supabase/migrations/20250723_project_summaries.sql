-- Create project_summaries table for AI-generated project state summaries
CREATE TABLE IF NOT EXISTS project_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_name TEXT NOT NULL,
    workspace_id UUID NOT NULL,
    summary TEXT NOT NULL,
    summary_markdown TEXT NOT NULL,
    last_memory_timestamp TIMESTAMP WITH TIME ZONE,
    memories_included INTEGER DEFAULT 0,
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    
    -- Ensure one summary per project per workspace
    UNIQUE(workspace_id, project_name)
);

-- Index for fast lookups
CREATE INDEX idx_project_summaries_workspace_project ON project_summaries(workspace_id, project_name);
CREATE INDEX idx_project_summaries_updated ON project_summaries(updated_at DESC);

-- RLS policies
ALTER TABLE project_summaries ENABLE ROW LEVEL SECURITY;

-- Users can view summaries for their workspace
CREATE POLICY "Users can view their workspace summaries" ON project_summaries
    FOR SELECT
    USING (
        workspace_id = COALESCE(
            (SELECT team_id FROM team_members WHERE user_id = auth.uid() LIMIT 1)::uuid,
            auth.uid()
        )
    );

-- Service role can manage all summaries
CREATE POLICY "Service role can manage summaries" ON project_summaries
    FOR ALL
    USING (auth.role() = 'service_role');

-- Trigger to update updated_at
CREATE TRIGGER update_project_summaries_updated_at
    BEFORE UPDATE ON project_summaries
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();