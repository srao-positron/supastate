-- Fix match_memories function to work with JSON string embeddings
CREATE OR REPLACE FUNCTION match_memories (
  query_embedding text, -- Changed from vector(3072) to text since embeddings are stored as JSON strings
  match_threshold float,
  match_count int,
  filter_user_id uuid DEFAULT NULL,
  filter_team_id uuid DEFAULT NULL,
  filter_project_name text DEFAULT NULL
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
    AND (filter_project_name IS NULL OR m.project_name = filter_project_name)
  ORDER BY (m.embedding::vector(3072)) <=> (query_embedding::vector(3072)) ASC
  LIMIT match_count;
END;
$$;