-- Simplify MCP authentication to use Supabase tokens directly
-- Remove the unnecessary OAuth tables we created

-- First remove the cron job if it exists
SELECT cron.unschedule('cleanup-mcp-tokens') 
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'cleanup-mcp-tokens'
);

-- Drop tables if they exist
DROP TABLE IF EXISTS mcp_access_tokens;
DROP TABLE IF EXISTS mcp_auth_codes;

-- Drop cleanup function if it exists
DROP FUNCTION IF EXISTS cleanup_expired_mcp_tokens();

-- The MCP server will now use Supabase auth tokens directly
-- No additional database setup needed