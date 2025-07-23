-- Create search function that works with workspace pattern

CREATE OR REPLACE FUNCTION search_memories(
  query_embedding vector(1536),
  workspace_filter text,
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10
)
RETURNS TABLE(
  id uuid,
  chunk_id text,
  session_id text,
  content text,
  similarity float,
  metadata jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.id,
    m.chunk_id,
    m.session_id,
    m.content,
    1 - (m.embedding <=> query_embedding) as similarity,
    m.metadata,
    m.created_at
  FROM memories m
  WHERE 
    m.workspace_id = workspace_filter
    AND m.embedding IS NOT NULL
    AND 1 - (m.embedding <=> query_embedding) > match_threshold
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION search_memories(vector(1536), text, float, int) TO authenticated;
GRANT EXECUTE ON FUNCTION search_memories(vector(1536), text, float, int) TO anon;