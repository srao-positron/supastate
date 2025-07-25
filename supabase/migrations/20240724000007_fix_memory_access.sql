-- Fix memory access issue - user can't see their own memories

-- Drop the existing policy
DROP POLICY IF EXISTS "memories_select_policy" ON memories;

-- Create a simpler, more explicit policy
CREATE POLICY "memories_select_policy_v2" ON memories
    FOR SELECT
    USING (
        -- User can ALWAYS see their own memories (regardless of team_id)
        user_id = auth.uid()
        OR
        -- User can see team memories if they're a member of that team
        (team_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.team_id = memories.team_id
            AND team_members.user_id = auth.uid()
        ))
    );

-- Let's also ensure the getWorkspaceInfo function handles this correctly
-- by updating other memory policies to be consistent

DROP POLICY IF EXISTS "memories_insert_policy" ON memories;
CREATE POLICY "memories_insert_policy_v2" ON memories
    FOR INSERT
    WITH CHECK (
        -- User can insert their own memories
        user_id = auth.uid()
        OR
        -- User can insert team memories if they're a member
        (team_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.team_id = memories.team_id
            AND team_members.user_id = auth.uid()
        ))
    );

DROP POLICY IF EXISTS "memories_update_policy" ON memories;
CREATE POLICY "memories_update_policy_v2" ON memories
    FOR UPDATE
    USING (
        -- User can update their own memories
        user_id = auth.uid()
        OR
        -- User can update team memories if they're a member
        (team_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.team_id = memories.team_id
            AND team_members.user_id = auth.uid()
        ))
    );

DROP POLICY IF EXISTS "memories_delete_policy" ON memories;
CREATE POLICY "memories_delete_policy_v2" ON memories
    FOR DELETE
    USING (
        -- User can delete their own memories
        user_id = auth.uid()
        OR
        -- User can delete team memories if they're an admin
        (team_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.team_id = memories.team_id
            AND team_members.user_id = auth.uid()
            AND team_members.role IN ('admin', 'owner')
        ))
    );

-- Note: project_summaries table was removed in favor of using memories and conversations tables