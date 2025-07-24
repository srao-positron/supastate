-- Enable pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Create a function for semantic search using cosine similarity
CREATE OR REPLACE FUNCTION match_memories(
  query_embedding vector(3072),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 20,
  filter_team_id uuid DEFAULT NULL,
  filter_user_id uuid DEFAULT NULL,
  filter_projects text[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  team_id uuid,
  user_id uuid,
  project_name text,
  chunk_id text,
  content text,
  metadata jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  similarity float
)
LANGUAGE sql STABLE
AS $$
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
    1 - (m.embedding <=> query_embedding) as similarity
  FROM memories m
  WHERE 
    -- Only match memories with embeddings
    m.embedding IS NOT NULL
    -- Apply similarity threshold
    AND 1 - (m.embedding <=> query_embedding) > match_threshold
    -- Apply team/user filters
    AND (
      (filter_team_id IS NOT NULL AND m.team_id = filter_team_id)
      OR (filter_user_id IS NOT NULL AND m.user_id = filter_user_id AND m.team_id IS NULL)
      OR (filter_team_id IS NULL AND filter_user_id IS NULL)
    )
    -- Apply project filter if provided
    AND (
      filter_projects IS NULL 
      OR m.project_name = ANY(filter_projects)
    )
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Skip index creation for now - 3072 dimensions exceed current pgvector index limits
-- The semantic search will still work, just without the performance optimization

-- Create a function to search memories with both semantic and text search
CREATE OR REPLACE FUNCTION hybrid_search_memories(
  query_embedding vector(3072),
  query_text text DEFAULT NULL,
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 20,
  filter_team_id uuid DEFAULT NULL,
  filter_user_id uuid DEFAULT NULL,
  filter_projects text[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  team_id uuid,
  user_id uuid,
  project_name text,
  chunk_id text,
  content text,
  metadata jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  similarity float,
  text_match boolean
)
LANGUAGE sql STABLE
AS $$
  WITH semantic_results AS (
    SELECT 
      m.*,
      1 - (m.embedding <=> query_embedding) as similarity
    FROM memories m
    WHERE 
      m.embedding IS NOT NULL
      AND 1 - (m.embedding <=> query_embedding) > match_threshold
  ),
  text_results AS (
    SELECT 
      m.*,
      0.5 as similarity -- Give text matches a baseline similarity
    FROM memories m
    WHERE 
      query_text IS NOT NULL
      AND m.content ILIKE '%' || query_text || '%'
  ),
  combined_results AS (
    SELECT DISTINCT ON (id)
      id,
      team_id,
      user_id,
      project_name,
      chunk_id,
      content,
      metadata,
      created_at,
      updated_at,
      GREATEST(
        COALESCE((SELECT similarity FROM semantic_results sr WHERE sr.id = r.id), 0),
        COALESCE((SELECT similarity FROM text_results tr WHERE tr.id = r.id), 0)
      ) as similarity,
      EXISTS(SELECT 1 FROM text_results tr WHERE tr.id = r.id) as text_match
    FROM (
      SELECT * FROM semantic_results
      UNION
      SELECT * FROM text_results
    ) r
  )
  SELECT *
  FROM combined_results
  WHERE
    -- Apply team/user filters
    (
      (filter_team_id IS NOT NULL AND team_id = filter_team_id)
      OR (filter_user_id IS NOT NULL AND user_id = filter_user_id AND team_id IS NULL)
      OR (filter_team_id IS NULL AND filter_user_id IS NULL)
    )
    -- Apply project filter if provided
    AND (
      filter_projects IS NULL 
      OR project_name = ANY(filter_projects)
    )
  ORDER BY similarity DESC
  LIMIT match_count;
$$;