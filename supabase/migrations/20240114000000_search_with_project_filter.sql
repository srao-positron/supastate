-- Drop the previous function
DROP FUNCTION IF EXISTS search_memories(vector(1536), text, float, int);

-- Create search function with project filter support
CREATE OR REPLACE FUNCTION search_memories(
  query_embedding vector(1536),
  workspace_filter text,
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10,
  project_filter text DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  chunk_id text,
  session_id text,
  content text,
  similarity float,
  metadata jsonb,
  created_at timestamptz,
  project_name text
)
LANGUAGE plpgsql
AS $$
DECLARE
  ws_type text;
  ws_id uuid;
BEGIN
  -- Parse workspace filter (format: 'user:uuid' or 'team:uuid')
  IF workspace_filter LIKE 'user:%' THEN
    ws_type := 'user';
    ws_id := SUBSTRING(workspace_filter FROM 6)::uuid;
  ELSIF workspace_filter LIKE 'team:%' THEN
    ws_type := 'team';
    ws_id := SUBSTRING(workspace_filter FROM 6)::uuid;
  ELSE
    RAISE EXCEPTION 'Invalid workspace filter format';
  END IF;

  RETURN QUERY
  SELECT 
    m.id,
    m.chunk_id,
    m.session_id,
    m.content,
    1 - (m.embedding <=> query_embedding) as similarity,
    m.metadata,
    m.created_at,
    m.project_name
  FROM memories m
  WHERE 
    CASE 
      WHEN ws_type = 'user' THEN m.user_id = ws_id
      WHEN ws_type = 'team' THEN m.team_id = ws_id
    END
    AND m.embedding IS NOT NULL
    AND 1 - (m.embedding <=> query_embedding) > match_threshold
    AND (project_filter IS NULL OR m.project_name = project_filter)
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION search_memories(vector(1536), text, float, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION search_memories(vector(1536), text, float, int, text) TO anon;