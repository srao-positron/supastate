-- Enhanced metadata for multi-dimensional search

-- Conversations table to group related memory chunks
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id TEXT NOT NULL,
  project_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  summary TEXT,
  topics TEXT[],
  tools_used TEXT[],
  files_touched TEXT[],
  commit_sha TEXT,
  branch_name TEXT,
  message_count INTEGER DEFAULT 0,
  code_blocks_count INTEGER DEFAULT 0,
  files_modified_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Repository states for source of truth
CREATE TABLE repository_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_repo_id BIGINT NOT NULL,
  full_name TEXT NOT NULL, -- owner/repo
  default_branch TEXT NOT NULL DEFAULT 'main',
  main_branch_sha TEXT NOT NULL,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stats JSONB DEFAULT '{}',
  entity_count INTEGER DEFAULT 0,
  relationship_count INTEGER DEFAULT 0,
  languages JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(github_repo_id, main_branch_sha)
);

-- Branch states for tracking local changes
CREATE TABLE branch_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_state_id UUID REFERENCES repository_states(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  branch_name TEXT NOT NULL,
  base_commit_sha TEXT NOT NULL,
  last_sync TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  entities_added JSONB DEFAULT '[]',
  entities_modified JSONB DEFAULT '[]',
  entities_deleted TEXT[] DEFAULT '{}',
  local_changes JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User repositories for permission tracking
CREATE TABLE user_repositories (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  github_repo_id BIGINT NOT NULL,
  full_name TEXT NOT NULL,
  permissions TEXT[] DEFAULT '{}', -- ['admin', 'write', 'read']
  last_accessed TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, github_repo_id)
);

-- Enhance memories table with rich metadata
ALTER TABLE memories 
ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS session_id TEXT,
ADD COLUMN IF NOT EXISTS file_paths TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS commit_sha TEXT,
ADD COLUMN IF NOT EXISTS branch_name TEXT,
ADD COLUMN IF NOT EXISTS topics TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS entities_mentioned TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS tools_used TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS message_type TEXT CHECK (message_type IN ('user', 'assistant', 'system', 'tool_use', 'tool_result')),
ADD COLUMN IF NOT EXISTS has_code BOOLEAN DEFAULT false;

-- Add search text column (will be populated by triggers)
ALTER TABLE memories 
ADD COLUMN IF NOT EXISTS search_text TEXT;

-- Create function to update search text
CREATE OR REPLACE FUNCTION update_memory_search_text()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_text = NEW.content || ' ' || 
    COALESCE(NEW.metadata->>'summary', '') || ' ' ||
    COALESCE(array_to_string(NEW.topics, ' '), '') || ' ' ||
    COALESCE(array_to_string(NEW.file_paths, ' '), '') || ' ' ||
    COALESCE(NEW.project_name, '');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to maintain search text
CREATE TRIGGER update_memory_search_text_trigger
BEFORE INSERT OR UPDATE ON memories
FOR EACH ROW
EXECUTE FUNCTION update_memory_search_text();

-- Update code_entities for source truth tracking
ALTER TABLE code_entities
ADD COLUMN IF NOT EXISTS repository_state_id UUID REFERENCES repository_states(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS branch_state_id UUID REFERENCES branch_states(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS is_source_truth BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS commit_sha TEXT,
ADD COLUMN IF NOT EXISTS file_hash TEXT;

-- Update code_relationships for source truth
ALTER TABLE code_relationships
ADD COLUMN IF NOT EXISTS repository_state_id UUID REFERENCES repository_states(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS branch_state_id UUID REFERENCES branch_states(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS is_source_truth BOOLEAN DEFAULT false;

-- Create indexes for multi-dimensional search
CREATE INDEX IF NOT EXISTS conversations_team_user_idx ON conversations(team_id, user_id);
CREATE INDEX IF NOT EXISTS conversations_project_idx ON conversations(project_name);
CREATE INDEX IF NOT EXISTS conversations_temporal_idx ON conversations(started_at DESC);
CREATE INDEX IF NOT EXISTS conversations_session_idx ON conversations(session_id);

CREATE INDEX IF NOT EXISTS memories_conversation_idx ON memories(conversation_id);
CREATE INDEX IF NOT EXISTS memories_user_project_idx ON memories(user_id, project_name);
CREATE INDEX IF NOT EXISTS memories_temporal_idx ON memories(created_at DESC);
CREATE INDEX IF NOT EXISTS memories_session_idx ON memories(session_id);
CREATE INDEX IF NOT EXISTS memories_branch_idx ON memories(branch_name) WHERE branch_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS memories_commit_idx ON memories(commit_sha) WHERE commit_sha IS NOT NULL;

-- Full-text search index
CREATE INDEX IF NOT EXISTS memories_search_idx ON memories USING GIN(to_tsvector('english', search_text));

-- Repository indexes
CREATE INDEX IF NOT EXISTS repository_states_github_idx ON repository_states(github_repo_id);
CREATE INDEX IF NOT EXISTS repository_states_name_idx ON repository_states(full_name);
CREATE INDEX IF NOT EXISTS branch_states_repo_idx ON branch_states(repository_state_id);
CREATE INDEX IF NOT EXISTS user_repositories_user_idx ON user_repositories(user_id);

-- Code entity indexes for source truth queries
CREATE INDEX IF NOT EXISTS code_entities_repo_state_idx ON code_entities(repository_state_id) WHERE is_source_truth = true;
CREATE INDEX IF NOT EXISTS code_entities_branch_state_idx ON code_entities(branch_state_id) WHERE is_source_truth = false;

-- Functions for enhanced search
CREATE OR REPLACE FUNCTION search_memories_advanced(
  p_team_id UUID,
  p_query TEXT DEFAULT NULL,
  p_projects TEXT[] DEFAULT NULL,
  p_users UUID[] DEFAULT NULL,
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to TIMESTAMPTZ DEFAULT NULL,
  p_branches TEXT[] DEFAULT NULL,
  p_has_code BOOLEAN DEFAULT NULL,
  p_topics TEXT[] DEFAULT NULL,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  chunk_id TEXT,
  content TEXT,
  project_name TEXT,
  user_id UUID,
  conversation_id UUID,
  created_at TIMESTAMPTZ,
  branch_name TEXT,
  commit_sha TEXT,
  topics TEXT[],
  file_paths TEXT[],
  relevance FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.id,
    m.chunk_id,
    m.content,
    m.project_name,
    m.user_id,
    m.conversation_id,
    m.created_at,
    m.branch_name,
    m.commit_sha,
    m.topics,
    m.file_paths,
    CASE 
      WHEN p_query IS NOT NULL THEN 
        ts_rank(to_tsvector('english', m.search_text), plainto_tsquery('english', p_query))
      ELSE 1.0
    END as relevance
  FROM memories m
  WHERE m.team_id = p_team_id
    AND (p_query IS NULL OR to_tsvector('english', m.search_text) @@ plainto_tsquery('english', p_query))
    AND (p_projects IS NULL OR m.project_name = ANY(p_projects))
    AND (p_users IS NULL OR m.user_id = ANY(p_users))
    AND (p_date_from IS NULL OR m.created_at >= p_date_from)
    AND (p_date_to IS NULL OR m.created_at <= p_date_to)
    AND (p_branches IS NULL OR m.branch_name = ANY(p_branches))
    AND (p_has_code IS NULL OR m.has_code = p_has_code)
    AND (p_topics IS NULL OR m.topics && p_topics)
  ORDER BY relevance DESC, m.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Function to get repository state diff
CREATE OR REPLACE FUNCTION get_repository_diff(
  p_repo_id BIGINT,
  p_branch_name TEXT,
  p_team_id UUID
)
RETURNS TABLE (
  entity_type TEXT,
  change_type TEXT,
  entity_name TEXT,
  file_path TEXT,
  details JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_branch_state_id UUID;
BEGIN
  -- Get the latest branch state
  SELECT bs.id INTO v_branch_state_id
  FROM branch_states bs
  JOIN repository_states rs ON rs.id = bs.repository_state_id
  WHERE rs.github_repo_id = p_repo_id
    AND bs.branch_name = p_branch_name
    AND bs.team_id = p_team_id
  ORDER BY bs.last_sync DESC
  LIMIT 1;

  IF v_branch_state_id IS NULL THEN
    RETURN;
  END IF;

  -- Return differences
  RETURN QUERY
  WITH branch_data AS (
    SELECT * FROM branch_states WHERE id = v_branch_state_id
  )
  SELECT 
    'entity' as entity_type,
    'added' as change_type,
    elem->>'name' as entity_name,
    elem->>'file_path' as file_path,
    elem as details
  FROM branch_data, jsonb_array_elements(entities_added) elem
  UNION ALL
  SELECT 
    'entity' as entity_type,
    'modified' as change_type,
    elem->>'name' as entity_name,
    elem->>'file_path' as file_path,
    elem as details
  FROM branch_data, jsonb_array_elements(entities_modified) elem
  UNION ALL
  SELECT 
    'entity' as entity_type,
    'deleted' as change_type,
    elem as entity_name,
    NULL as file_path,
    NULL as details
  FROM branch_data, unnest(entities_deleted) elem;
END;
$$;

-- RLS Policies
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE repository_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_repositories ENABLE ROW LEVEL SECURITY;

-- Conversation policies
CREATE POLICY "Users can view their team's conversations" ON conversations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM team_members 
      WHERE team_members.team_id = conversations.team_id 
      AND team_members.user_id = auth.uid()
    )
  );

-- Repository access policies
CREATE POLICY "Users can view repositories they have access to" ON user_repositories
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can view repository states for their repos" ON repository_states
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_repositories ur
      WHERE ur.github_repo_id = repository_states.github_repo_id
      AND ur.user_id = auth.uid()
    )
  );

-- Update triggers
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_branch_states_updated_at BEFORE UPDATE ON branch_states
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();