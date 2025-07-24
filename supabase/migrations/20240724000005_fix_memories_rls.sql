-- Fix RLS policies for memories table to ensure proper access

-- Drop any existing memories policies that might be causing issues
DROP POLICY IF EXISTS "Memories are viewable by workspace members" ON memories;
DROP POLICY IF EXISTS "memories_select" ON memories;
DROP POLICY IF EXISTS "memories_insert" ON memories;
DROP POLICY IF EXISTS "memories_update" ON memories;
DROP POLICY IF EXISTS "memories_delete" ON memories;

-- Create a comprehensive SELECT policy for memories
CREATE POLICY "memories_select_policy" ON memories
    FOR SELECT
    USING (
        -- Personal memories (no team)
        (team_id IS NULL AND user_id = auth.uid())
        OR
        -- Team memories where user is a member
        (team_id IS NOT NULL AND is_team_member(team_id, auth.uid()))
        OR
        -- User's personal memories even if they're in a team
        (user_id = auth.uid() AND team_id IS NULL)
    );

-- INSERT policy - users can only insert their own memories
CREATE POLICY "memories_insert_policy" ON memories
    FOR INSERT
    WITH CHECK (
        -- Must be authenticated
        auth.uid() IS NOT NULL
        AND
        (
            -- Personal memory
            (team_id IS NULL AND user_id = auth.uid())
            OR
            -- Team memory where user is a member
            (team_id IS NOT NULL AND is_team_member(team_id, auth.uid()))
        )
    );

-- UPDATE policy - users can update their own memories or team memories
CREATE POLICY "memories_update_policy" ON memories
    FOR UPDATE
    USING (
        -- Personal memories
        (team_id IS NULL AND user_id = auth.uid())
        OR
        -- Team memories where user is a member
        (team_id IS NOT NULL AND is_team_member(team_id, auth.uid()))
    );

-- DELETE policy - users can delete their own memories or team memories if admin
CREATE POLICY "memories_delete_policy" ON memories
    FOR DELETE
    USING (
        -- Personal memories
        (team_id IS NULL AND user_id = auth.uid())
        OR
        -- Team memories where user is an admin
        (team_id IS NOT NULL AND is_team_admin(team_id, auth.uid()))
    );

-- Ensure RLS is enabled
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;

-- Also fix project_summaries RLS if it doesn't exist
DROP POLICY IF EXISTS "project_summaries_select" ON project_summaries;

CREATE POLICY "project_summaries_select_policy" ON project_summaries
    FOR SELECT
    USING (
        -- Personal summaries
        workspace_id = auth.uid()
        OR
        -- Team summaries where user is a member
        is_team_member(workspace_id, auth.uid())
    );

-- Enable RLS on project_summaries
ALTER TABLE project_summaries ENABLE ROW LEVEL SECURITY;