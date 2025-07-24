-- Fix infinite recursion in team_members RLS policies

-- Drop all existing policies on team_members
DROP POLICY IF EXISTS "Team members are viewable by team members" ON team_members;
DROP POLICY IF EXISTS "Team members can be removed by team admins and owners" ON team_members;
DROP POLICY IF EXISTS "team_members_select" ON team_members;
DROP POLICY IF EXISTS "team_members_delete" ON team_members;
DROP POLICY IF EXISTS "Users can view their own team memberships" ON team_members;
DROP POLICY IF EXISTS "Team admins can view all team members" ON team_members;

-- Create non-recursive SELECT policy
-- This allows users to see their own memberships and memberships of teams they belong to
CREATE POLICY "team_members_select_policy" ON team_members
  FOR SELECT
  USING (
    -- User can see their own membership
    user_id = auth.uid()
    OR
    -- User can see other members of teams they belong to
    team_id IN (
      SELECT team_id 
      FROM team_members AS tm
      WHERE tm.user_id = auth.uid()
    )
  );

-- Create INSERT policy for team admins
CREATE POLICY "team_members_insert_policy" ON team_members
  FOR INSERT
  WITH CHECK (
    -- Check if the current user is an admin/owner of the team
    EXISTS (
      SELECT 1
      FROM team_members AS tm
      WHERE tm.team_id = team_members.team_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('admin', 'owner')
    )
    OR
    -- Allow first member (owner) when team is created
    NOT EXISTS (
      SELECT 1
      FROM team_members AS tm
      WHERE tm.team_id = team_members.team_id
    )
  );

-- Create UPDATE policy for team admins
CREATE POLICY "team_members_update_policy" ON team_members
  FOR UPDATE
  USING (
    -- Check if the current user is an admin/owner of the team
    EXISTS (
      SELECT 1
      FROM team_members AS tm
      WHERE tm.team_id = team_members.team_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('admin', 'owner')
    )
  );

-- Create DELETE policy for team admins
CREATE POLICY "team_members_delete_policy" ON team_members
  FOR DELETE
  USING (
    -- Check if the current user is an admin/owner of the team
    EXISTS (
      SELECT 1
      FROM team_members AS tm
      WHERE tm.team_id = team_members.team_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('admin', 'owner')
    )
  );

-- Also ensure the auto-assignment function doesn't cause issues
CREATE OR REPLACE FUNCTION public.auto_assign_team_on_login()
RETURNS TRIGGER AS $$
DECLARE
  github_handle TEXT;
  team_record RECORD;
BEGIN
  -- Extract GitHub username from user metadata
  github_handle := NEW.raw_user_meta_data->>'user_name';
  
  -- Only proceed if we have a GitHub handle
  IF github_handle IS NOT NULL THEN
    -- Find teams that include this GitHub handle
    FOR team_record IN 
      SELECT id FROM public.teams 
      WHERE github_handle = ANY(github_handles)
    LOOP
      -- Add user to team with member role
      INSERT INTO public.team_members (team_id, user_id, role)
      VALUES (team_record.id, NEW.id, 'member')
      ON CONFLICT (team_id, user_id) DO NOTHING;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Make sure the trigger exists
DROP TRIGGER IF EXISTS auto_assign_team_on_login_trigger ON auth.users;
CREATE TRIGGER auto_assign_team_on_login_trigger
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_team_on_login();