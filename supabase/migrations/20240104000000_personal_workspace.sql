-- Enable personal workspaces by making team_id optional
-- and ensuring user_id is properly constrained

-- First, drop the existing unique constraint
ALTER TABLE memories DROP CONSTRAINT IF EXISTS memories_team_id_chunk_id_key;

-- Make team_id nullable to support personal workspaces
ALTER TABLE memories ALTER COLUMN team_id DROP NOT NULL;

-- Add a new unique constraint that considers both team and user workspaces
-- A memory is unique by chunk_id within either a team OR a user's personal space
ALTER TABLE memories ADD CONSTRAINT memories_workspace_chunk_unique 
  UNIQUE NULLS NOT DISTINCT (team_id, user_id, chunk_id);

-- Add check constraint to ensure either team_id or user_id is present
ALTER TABLE memories ADD CONSTRAINT memories_workspace_check 
  CHECK (team_id IS NOT NULL OR user_id IS NOT NULL);

-- Update indexes to support personal workspace queries
CREATE INDEX IF NOT EXISTS memories_user_project_idx ON memories(user_id, project_name) 
  WHERE team_id IS NULL;

-- Similar changes for code entities
ALTER TABLE code_entities DROP CONSTRAINT IF EXISTS code_entities_team_id_project_name_file_path_name_entity__key;
ALTER TABLE code_entities ALTER COLUMN team_id DROP NOT NULL;

-- Add user_id column to code_entities if not exists
ALTER TABLE code_entities ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Add unique constraint for code entities
ALTER TABLE code_entities ADD CONSTRAINT code_entities_workspace_unique 
  UNIQUE NULLS NOT DISTINCT (team_id, user_id, project_name, file_path, name, entity_type);

-- Add check constraint
ALTER TABLE code_entities ADD CONSTRAINT code_entities_workspace_check 
  CHECK (team_id IS NOT NULL OR user_id IS NOT NULL);

-- Update code_relationships similarly
ALTER TABLE code_relationships ALTER COLUMN team_id DROP NOT NULL;
ALTER TABLE code_relationships ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE code_relationships ADD CONSTRAINT code_relationships_workspace_check 
  CHECK (team_id IS NOT NULL OR user_id IS NOT NULL);

-- Create indexes for user-based queries
CREATE INDEX IF NOT EXISTS code_entities_user_project_idx ON code_entities(user_id, project_name) 
  WHERE team_id IS NULL;
CREATE INDEX IF NOT EXISTS code_relationships_user_project_idx ON code_relationships(user_id, project_name) 
  WHERE team_id IS NULL;

-- Update RLS policies to support personal workspaces
-- Drop existing policies
DROP POLICY IF EXISTS "memories_team_access" ON memories;
DROP POLICY IF EXISTS "code_entities_team_access" ON code_entities;
DROP POLICY IF EXISTS "code_relationships_team_access" ON code_relationships;

-- Create new policies that support both team and personal access
CREATE POLICY "memories_workspace_access" ON memories
  FOR ALL USING (
    -- User can access their personal memories
    (team_id IS NULL AND user_id = auth.uid()) OR
    -- User can access team memories if they're a member
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM team_members 
      WHERE team_members.team_id = memories.team_id 
      AND team_members.user_id = auth.uid()
    ))
  );

CREATE POLICY "code_entities_workspace_access" ON code_entities
  FOR ALL USING (
    -- User can access their personal code entities
    (team_id IS NULL AND user_id = auth.uid()) OR
    -- User can access team code entities if they're a member
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM team_members 
      WHERE team_members.team_id = code_entities.team_id 
      AND team_members.user_id = auth.uid()
    ))
  );

CREATE POLICY "code_relationships_workspace_access" ON code_relationships
  FOR ALL USING (
    -- User can access their personal code relationships
    (team_id IS NULL AND user_id = auth.uid()) OR
    -- User can access team code relationships if they're a member
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM team_members 
      WHERE team_members.team_id = code_relationships.team_id 
      AND team_members.user_id = auth.uid()
    ))
  );

-- Update the search_memories function to support personal workspaces
CREATE OR REPLACE FUNCTION search_memories(
  p_team_id UUID,
  p_query_embedding vector(1536),
  p_user_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 10,
  p_project_filter TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  team_id UUID,
  user_id UUID,
  project_name TEXT,
  chunk_id TEXT,
  content TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.id,
    m.team_id,
    m.user_id,
    m.project_name,
    m.chunk_id,
    m.content,
    m.metadata,
    m.created_at,
    m.updated_at,
    1 - (m.embedding <=> p_query_embedding) AS similarity
  FROM memories m
  WHERE 
    -- Match workspace (team or personal)
    ((p_team_id IS NOT NULL AND m.team_id = p_team_id) OR 
     (p_team_id IS NULL AND m.user_id = p_user_id))
    -- Apply project filter if provided
    AND (p_project_filter IS NULL OR m.project_name = ANY(p_project_filter))
    -- Only return memories with embeddings
    AND m.embedding IS NOT NULL
  ORDER BY m.embedding <=> p_query_embedding
  LIMIT p_limit;
END;
$$;

-- Function to ensure user exists in users table when they sign up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, avatar_url)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, users.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically create user record on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();