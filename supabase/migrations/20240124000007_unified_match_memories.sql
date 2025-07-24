-- Drop all existing versions of match_memories
DROP FUNCTION IF EXISTS match_memories(text, double precision, integer, uuid, uuid, text[]);
DROP FUNCTION IF EXISTS match_memories(vector, double precision, integer, uuid, uuid, text[]);

-- Create a single unified match_memories function that handles JSON string embeddings
CREATE OR REPLACE FUNCTION match_memories (
  query_embedding text, -- JSON string embedding
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 20,
  filter_team_id uuid DEFAULT NULL,
  filter_user_id uuid DEFAULT NULL,
  filter_projects text[] DEFAULT NULL -- Array of project names
)
RETURNS TABLE (
  id uuid,
  team_id uuid,
  user_id uuid,
  project_name text,
  chunk_id text,
  content text,
  metadata jsonb,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  similarity float
)
LANGUAGE plpgsql STABLE
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
    -- Calculate cosine similarity between JSON array strings
    (1 - (
      (m.embedding::vector(3072)) <=> (query_embedding::vector(3072))
    ))::float as similarity
  FROM memories m
  WHERE 
    -- Only match memories with embeddings
    m.embedding IS NOT NULL
    -- Apply similarity threshold
    AND (1 - (
      (m.embedding::vector(3072)) <=> (query_embedding::vector(3072))
    )) > match_threshold
    -- Apply filters
    AND (filter_user_id IS NULL OR m.user_id = filter_user_id)
    AND (filter_team_id IS NULL OR m.team_id = filter_team_id)
    AND (filter_projects IS NULL OR m.project_name = ANY(filter_projects))
  ORDER BY (m.embedding::vector(3072)) <=> (query_embedding::vector(3072)) ASC
  LIMIT match_count;
END;
$$;