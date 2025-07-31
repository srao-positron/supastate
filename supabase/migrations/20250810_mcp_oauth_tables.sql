-- Create tables for MCP OAuth flow
CREATE TABLE IF NOT EXISTS mcp_auth_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT,
  code_challenge_method TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mcp_access_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  refresh_token TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  scopes TEXT[] DEFAULT ARRAY['read'],
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_mcp_auth_codes_code ON mcp_auth_codes(code);
CREATE INDEX IF NOT EXISTS idx_mcp_auth_codes_user_id ON mcp_auth_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_mcp_auth_codes_expires_at ON mcp_auth_codes(expires_at);

CREATE INDEX IF NOT EXISTS idx_mcp_access_tokens_token ON mcp_access_tokens(token);
CREATE INDEX IF NOT EXISTS idx_mcp_access_tokens_refresh_token ON mcp_access_tokens(refresh_token);
CREATE INDEX IF NOT EXISTS idx_mcp_access_tokens_user_id ON mcp_access_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_mcp_access_tokens_expires_at ON mcp_access_tokens(expires_at);

-- Enable RLS
ALTER TABLE mcp_auth_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_access_tokens ENABLE ROW LEVEL SECURITY;

-- RLS policies (service role only for OAuth operations)
CREATE POLICY "Service role only" ON mcp_auth_codes
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role only" ON mcp_access_tokens
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- Function to clean up expired tokens
CREATE OR REPLACE FUNCTION cleanup_expired_mcp_tokens()
RETURNS void AS $$
BEGIN
  DELETE FROM mcp_auth_codes WHERE expires_at < NOW();
  DELETE FROM mcp_access_tokens WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Create a cron job to clean up expired tokens every hour
SELECT cron.schedule(
  'cleanup-mcp-tokens',
  '0 * * * *', -- Every hour
  'SELECT cleanup_expired_mcp_tokens();'
);