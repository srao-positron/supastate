-- Create function to set user context for API requests
CREATE OR REPLACE FUNCTION api_user_id()
RETURNS UUID AS $$
BEGIN
  -- Try to get user ID from JWT claim (web auth)
  IF current_setting('request.jwt.claims', true)::json->>'sub' IS NOT NULL THEN
    RETURN (current_setting('request.jwt.claims', true)::json->>'sub')::UUID;
  END IF;
  
  -- Try to get user ID from API context (API key auth)
  IF current_setting('app.user_id', true) IS NOT NULL THEN
    RETURN current_setting('app.user_id', true)::UUID;
  END IF;
  
  -- No user context found
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Create function to set API user context
CREATE OR REPLACE FUNCTION set_api_user_context(p_user_id UUID)
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.user_id', p_user_id::text, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update RLS policies to use the new function
DROP POLICY IF EXISTS "memories_workspace_access" ON memories;
CREATE POLICY "memories_workspace_access" ON memories
  FOR ALL USING (
    -- Check if user has access to this memory
    CASE
      -- Personal workspace memory
      WHEN team_id IS NULL THEN user_id = api_user_id()
      -- Team workspace memory
      ELSE team_id IN (
        SELECT team_id FROM team_members 
        WHERE user_id = api_user_id()
      )
    END
  );

DROP POLICY IF EXISTS "code_entities_workspace_access" ON code_entities;
CREATE POLICY "code_entities_workspace_access" ON code_entities
  FOR ALL USING (
    CASE
      WHEN team_id IS NULL THEN user_id = api_user_id()
      ELSE team_id IN (
        SELECT team_id FROM team_members 
        WHERE user_id = api_user_id()
      )
    END
  );

DROP POLICY IF EXISTS "code_relationships_workspace_access" ON code_relationships;
CREATE POLICY "code_relationships_workspace_access" ON code_relationships
  FOR ALL USING (
    CASE
      WHEN team_id IS NULL THEN user_id = api_user_id()
      ELSE team_id IN (
        SELECT team_id FROM team_members 
        WHERE user_id = api_user_id()
      )
    END
  );

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION set_api_user_context(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION api_user_id() TO anon, authenticated, service_role;