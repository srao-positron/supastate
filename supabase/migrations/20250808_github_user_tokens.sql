
-- Create github_user_tokens table if not exists
CREATE TABLE IF NOT EXISTS github_user_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  token_type TEXT DEFAULT 'bearer',
  scope TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Create RLS policies
ALTER TABLE github_user_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tokens" ON github_user_tokens
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all tokens" ON github_user_tokens
  FOR ALL USING (auth.role() = 'service_role');

-- Create get_github_token function
CREATE OR REPLACE FUNCTION get_github_token(user_id UUID)
RETURNS TEXT AS $$
DECLARE
  token TEXT;
BEGIN
  SELECT access_token INTO token
  FROM github_user_tokens
  WHERE github_user_tokens.user_id = $1;
  
  RETURN token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_github_token TO service_role;
