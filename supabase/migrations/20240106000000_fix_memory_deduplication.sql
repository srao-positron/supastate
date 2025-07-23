-- Fix memory deduplication to properly handle chunk updates
-- Each chunk_id should be unique within a workspace (team or personal)

-- First, drop the existing constraint
ALTER TABLE memories DROP CONSTRAINT IF EXISTS memories_workspace_chunk_unique;

-- Add a computed column for workspace_id that coalesces team_id and user_id
-- This ensures each memory belongs to exactly one workspace
ALTER TABLE memories ADD COLUMN IF NOT EXISTS workspace_id UUID GENERATED ALWAYS AS (COALESCE(team_id, user_id)) STORED;

-- Create index on workspace_id for performance
CREATE INDEX IF NOT EXISTS memories_workspace_id_idx ON memories(workspace_id);

-- Now create a unique constraint on workspace_id and chunk_id
-- This ensures each chunk_id is unique within a workspace
ALTER TABLE memories ADD CONSTRAINT memories_workspace_chunk_unique 
  UNIQUE (workspace_id, chunk_id);

-- Update the upsert to handle conflicts properly
-- The API will use ON CONFLICT (workspace_id, chunk_id) DO UPDATE