-- Add github_handles column to teams table
ALTER TABLE public.teams 
ADD COLUMN IF NOT EXISTS github_handles TEXT[] DEFAULT '{}';

-- Add description column
ALTER TABLE public.teams 
ADD COLUMN IF NOT EXISTS description TEXT;

-- Add created_by column
ALTER TABLE public.teams 
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- Add updated_at column if it doesn't exist
ALTER TABLE public.teams 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create index on github_handles
CREATE INDEX IF NOT EXISTS idx_teams_github_handles ON public.teams USING GIN(github_handles);

-- Function to auto-assign users to teams based on GitHub handle
CREATE OR REPLACE FUNCTION public.auto_assign_team_on_login()
RETURNS TRIGGER AS $$
DECLARE
  github_handle TEXT;
  team_record RECORD;
BEGIN
  -- Extract GitHub handle from raw_user_meta_data
  github_handle := NEW.raw_user_meta_data->>'user_name';
  
  IF github_handle IS NOT NULL THEN
    -- Find all teams that include this GitHub handle
    FOR team_record IN 
      SELECT id FROM public.teams 
      WHERE github_handle = ANY(github_handles)
    LOOP
      -- Add user to team if not already a member
      INSERT INTO public.team_members (team_id, user_id, role)
      VALUES (team_record.id, NEW.id, 'member')
      ON CONFLICT (team_id, user_id) DO NOTHING;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to auto-assign teams on user creation/update
DROP TRIGGER IF EXISTS auto_assign_team_on_login_trigger ON auth.users;
CREATE TRIGGER auto_assign_team_on_login_trigger
  AFTER INSERT OR UPDATE OF raw_user_meta_data ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_team_on_login();

-- Also create a function to manually sync existing users to teams
CREATE OR REPLACE FUNCTION public.sync_existing_users_to_teams()
RETURNS void AS $$
DECLARE
  user_record RECORD;
  team_record RECORD;
  github_handle TEXT;
BEGIN
  -- Loop through all users
  FOR user_record IN SELECT id, raw_user_meta_data FROM auth.users
  LOOP
    github_handle := user_record.raw_user_meta_data->>'user_name';
    
    IF github_handle IS NOT NULL THEN
      -- Find all teams that include this GitHub handle
      FOR team_record IN 
        SELECT id FROM public.teams 
        WHERE github_handle = ANY(github_handles)
      LOOP
        -- Add user to team if not already a member
        INSERT INTO public.team_members (team_id, user_id, role)
        VALUES (team_record.id, user_record.id, 'member')
        ON CONFLICT (team_id, user_id) DO NOTHING;
      END LOOP;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add a comment explaining the function
COMMENT ON FUNCTION public.sync_existing_users_to_teams() IS 'Syncs all existing users to teams based on their GitHub handles. Run this after adding GitHub handles to teams.';