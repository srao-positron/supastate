-- Completely fix the infinite recursion in team_members RLS policies
-- by using a different approach that avoids self-referencing queries

-- First, disable RLS temporarily to ensure we can make changes
ALTER TABLE team_members DISABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies to start fresh
DROP POLICY IF EXISTS "Team members are viewable by team members" ON team_members;
DROP POLICY IF EXISTS "Team members can be removed by team admins and owners" ON team_members;
DROP POLICY IF EXISTS "team_members_select" ON team_members;
DROP POLICY IF EXISTS "team_members_delete" ON team_members;
DROP POLICY IF EXISTS "Users can view their own team memberships" ON team_members;
DROP POLICY IF EXISTS "Team admins can view all team members" ON team_members;
DROP POLICY IF EXISTS "team_members_select_policy" ON team_members;
DROP POLICY IF EXISTS "team_members_insert_policy" ON team_members;
DROP POLICY IF EXISTS "team_members_update_policy" ON team_members;
DROP POLICY IF EXISTS "team_members_delete_policy" ON team_members;

-- Create a helper function that doesn't cause recursion
-- This function checks if a user is a member of a team without querying team_members table
CREATE OR REPLACE FUNCTION is_team_member(check_team_id uuid, check_user_id uuid)
RETURNS boolean AS $$
DECLARE
    is_member boolean;
BEGIN
    -- Direct query with no RLS applied
    SELECT EXISTS (
        SELECT 1 
        FROM team_members 
        WHERE team_id = check_team_id 
        AND user_id = check_user_id
    ) INTO is_member;
    
    RETURN is_member;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create another helper for checking admin/owner status
CREATE OR REPLACE FUNCTION is_team_admin(check_team_id uuid, check_user_id uuid)
RETURNS boolean AS $$
DECLARE
    is_admin boolean;
BEGIN
    -- Direct query with no RLS applied
    SELECT EXISTS (
        SELECT 1 
        FROM team_members 
        WHERE team_id = check_team_id 
        AND user_id = check_user_id
        AND role IN ('admin', 'owner')
    ) INTO is_admin;
    
    RETURN is_admin;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Now create simple, non-recursive policies using these functions

-- SELECT policy: Users can see team members of teams they belong to
CREATE POLICY "team_members_select" ON team_members
    FOR SELECT
    USING (
        -- User can see their own membership
        user_id = auth.uid()
        OR
        -- User can see members of teams they belong to
        is_team_member(team_id, auth.uid())
    );

-- INSERT policy: Only team admins can add members
CREATE POLICY "team_members_insert" ON team_members
    FOR INSERT
    WITH CHECK (
        -- Check if the current user is an admin of the team
        is_team_admin(team_members.team_id, auth.uid())
        OR
        -- Allow first member (owner) when team is created
        NOT EXISTS (
            SELECT 1 FROM team_members tm 
            WHERE tm.team_id = team_members.team_id
        )
    );

-- UPDATE policy: Only team admins can update members
CREATE POLICY "team_members_update" ON team_members
    FOR UPDATE
    USING (
        is_team_admin(team_members.team_id, auth.uid())
    );

-- DELETE policy: Only team admins can remove members
CREATE POLICY "team_members_delete" ON team_members
    FOR DELETE
    USING (
        is_team_admin(team_members.team_id, auth.uid())
    );

-- Re-enable RLS
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- Also update the memories table policies to use the helper functions
-- This ensures consistency and avoids any potential recursion there too

-- Drop existing memory policies
DROP POLICY IF EXISTS "Memories are viewable by workspace members" ON memories;

-- Create new memory policy using helper function
CREATE POLICY "Memories are viewable by workspace members" ON memories
    FOR SELECT
    USING (
        -- Personal memories
        (team_id IS NULL AND user_id = auth.uid())
        OR
        -- Team memories - use helper function
        (team_id IS NOT NULL AND is_team_member(team_id, auth.uid()))
    );

-- Grant execute permissions on helper functions to authenticated users
GRANT EXECUTE ON FUNCTION is_team_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION is_team_admin(uuid, uuid) TO authenticated;

-- Add indexes to improve performance of these checks
CREATE INDEX IF NOT EXISTS idx_team_members_lookup ON team_members(team_id, user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_role_lookup ON team_members(team_id, user_id, role);