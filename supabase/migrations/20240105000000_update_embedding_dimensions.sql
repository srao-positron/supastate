-- Update embedding dimensions to match Camille's text-embedding-3-large model (3072 dimensions)
-- Note: pgvector currently has a 2000 dimension limit for indexes, so we'll store embeddings
-- but implement search differently

-- Enable trigram extension for text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Drop existing indexes that depend on the embedding column
DROP INDEX IF EXISTS memories_embedding_idx;
DROP INDEX IF EXISTS code_entities_embedding_idx;

-- Update memories table embedding column
ALTER TABLE memories 
ALTER COLUMN embedding TYPE vector(3072);

-- Update code_entities table embedding column
ALTER TABLE code_entities 
ALTER COLUMN embedding TYPE vector(3072);

-- Since we can't create vector indexes for >2000 dimensions, we'll:
-- 1. Store the full 3072-dimensional embeddings
-- 2. Create regular indexes for efficient filtering
-- 3. Implement similarity search in application layer or use external vector DB

-- Create indexes for efficient filtering
CREATE INDEX IF NOT EXISTS memories_chunk_id_idx ON memories(chunk_id);
CREATE INDEX IF NOT EXISTS memories_session_idx ON memories((metadata->>'sessionId'));
CREATE INDEX IF NOT EXISTS memories_topics_idx ON memories USING GIN ((metadata->'topics'));
CREATE INDEX IF NOT EXISTS code_entities_name_trgm_idx ON code_entities USING gin(name gin_trgm_ops);

-- Update the search_memories function to use the new dimensions
DROP FUNCTION IF EXISTS search_memories(UUID, UUID, vector(1536), INTEGER, TEXT[]);

CREATE OR REPLACE FUNCTION search_memories(
  p_team_id UUID,
  p_query_embedding vector(3072),
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