-- Add user_id to API keys table for personal API keys

-- Add user_id column if it doesn't exist
ALTER TABLE api_keys 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- Update constraint to allow either team_id or user_id
ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_team_check;
ALTER TABLE api_keys ADD CONSTRAINT api_keys_owner_check 
  CHECK (team_id IS NOT NULL OR user_id IS NOT NULL);

-- Add index for user lookups
CREATE INDEX IF NOT EXISTS api_keys_user_id_idx ON api_keys(user_id) WHERE user_id IS NOT NULL;

-- Update RLS policies for API keys
DROP POLICY IF EXISTS "api_keys_team_access" ON api_keys;

CREATE POLICY "api_keys_access" ON api_keys
  FOR ALL USING (
    -- User can manage their personal API keys
    (user_id = auth.uid()) OR
    -- User can manage team API keys if they're an admin/owner
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM team_members 
      WHERE team_members.team_id = api_keys.team_id 
      AND team_members.user_id = auth.uid()
      AND team_members.role IN ('owner', 'admin')
    ))
  );

-- Enable RLS on api_keys table
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;