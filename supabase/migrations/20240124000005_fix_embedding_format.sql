-- Fix embedding storage format from string to vector array
-- First, add a temporary column for the new vector format
ALTER TABLE memories ADD COLUMN IF NOT EXISTS embedding_vector vector(3072);

-- Convert existing string embeddings to vector format
-- This assumes the strings are JSON arrays that need to be parsed
UPDATE memories 
SET embedding_vector = embedding::vector(3072)
WHERE embedding IS NOT NULL 
AND embedding_vector IS NULL;

-- Drop the old embedding column and rename the new one
ALTER TABLE memories DROP COLUMN IF EXISTS embedding;
ALTER TABLE memories RENAME COLUMN embedding_vector TO embedding;

-- Update the match_memories function to ensure it works with the new format
CREATE OR REPLACE FUNCTION match_memories (
  query_embedding vector(3072),
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
LANGUAGE sql STABLE
AS $$
  SELECT
    memories.id,
    memories.team_id,
    memories.user_id,
    memories.project_name,
    memories.chunk_id,
    memories.content,
    memories.metadata,
    memories.created_at,
    memories.updated_at,
    1 - (memories.embedding <=> query_embedding) as similarity
  FROM memories
  WHERE 
    -- Only match memories with embeddings
    memories.embedding IS NOT NULL
    -- Apply similarity threshold
    AND 1 - (memories.embedding <=> query_embedding) > match_threshold
    -- Apply filters
    AND (filter_user_id IS NULL OR memories.user_id = filter_user_id)
    AND (filter_team_id IS NULL OR memories.team_id = filter_team_id)
    AND (filter_project_name IS NULL OR memories.project_name = filter_project_name)
  ORDER BY memories.embedding <=> query_embedding ASC
  LIMIT match_count;
$$;

-- Create an index on the vector column for better performance
CREATE INDEX IF NOT EXISTS memories_embedding_idx ON memories 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);