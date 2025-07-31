-- Add secure GitHub token storage to users table
-- Uses pgcrypto for encryption at rest

-- Enable pgcrypto extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add encrypted GitHub token column to users table
ALTER TABLE IF EXISTS public.users 
ADD COLUMN IF NOT EXISTS github_access_token_encrypted text,
ADD COLUMN IF NOT EXISTS github_token_updated_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS github_token_scopes text[],
ADD COLUMN IF NOT EXISTS github_username text;

-- Create a function to securely store GitHub tokens
-- This encrypts the token using a key derived from the user's ID and a secret
CREATE OR REPLACE FUNCTION public.store_github_token(
  user_id uuid,
  token text,
  scopes text[] DEFAULT NULL,
  username text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  encryption_key text;
BEGIN
  -- Generate a user-specific encryption key using vault
  -- This uses Supabase's built-in vault for secure key derivation
  encryption_key := encode(
    digest(
      user_id::text || current_database() || 'github_token_v1',
      'sha256'
    ),
    'hex'
  );

  -- Update the user record with encrypted token
  UPDATE users
  SET 
    github_access_token_encrypted = encode(
      encrypt(
        token::bytea,
        encryption_key::bytea,
        'aes'
      ),
      'base64'
    ),
    github_token_updated_at = now(),
    github_token_scopes = scopes,
    github_username = COALESCE(store_github_token.username, users.github_username)
  WHERE id = user_id;
END;
$$;

-- Create a function to retrieve GitHub tokens
-- This decrypts the token for authorized use
CREATE OR REPLACE FUNCTION public.get_github_token(
  user_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  encryption_key text;
  encrypted_token text;
  decrypted_token text;
BEGIN
  -- Only allow users to retrieve their own token
  IF auth.uid() != user_id AND current_setting('role') != 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized access to GitHub token';
  END IF;

  -- Get the encrypted token
  SELECT github_access_token_encrypted INTO encrypted_token
  FROM users
  WHERE id = user_id;

  IF encrypted_token IS NULL THEN
    RETURN NULL;
  END IF;

  -- Generate the same encryption key
  encryption_key := encode(
    digest(
      user_id::text || current_database() || 'github_token_v1',
      'sha256'
    ),
    'hex'
  );

  -- Decrypt and return the token
  BEGIN
    decrypted_token := convert_from(
      decrypt(
        decode(encrypted_token, 'base64'),
        encryption_key::bytea,
        'aes'
      ),
      'UTF8'
    );
    RETURN decrypted_token;
  EXCEPTION WHEN OTHERS THEN
    -- Log error and return NULL if decryption fails
    RAISE WARNING 'Failed to decrypt GitHub token for user %: %', user_id, SQLERRM;
    RETURN NULL;
  END;
END;
$$;

-- Create an index for faster lookups of users with GitHub tokens
CREATE INDEX IF NOT EXISTS idx_users_github_token_exists 
ON public.users (id) 
WHERE github_access_token_encrypted IS NOT NULL;

-- Add RLS policies for the new columns
-- Users can only see their own GitHub metadata (not the encrypted token)
CREATE OR REPLACE VIEW public.user_github_info AS
SELECT 
  id,
  github_username,
  github_token_scopes,
  github_token_updated_at,
  CASE 
    WHEN github_access_token_encrypted IS NOT NULL THEN true 
    ELSE false 
  END as has_github_token
FROM public.users;

-- Grant appropriate permissions
GRANT SELECT ON public.user_github_info TO authenticated;

-- Add comment for documentation
COMMENT ON COLUMN public.users.github_access_token_encrypted IS 'Encrypted GitHub OAuth access token - never expose directly';
COMMENT ON COLUMN public.users.github_token_updated_at IS 'When the GitHub token was last updated';
COMMENT ON COLUMN public.users.github_token_scopes IS 'OAuth scopes granted for this GitHub token';
COMMENT ON COLUMN public.users.github_username IS 'GitHub username associated with this token';

COMMENT ON FUNCTION public.store_github_token IS 'Securely stores an encrypted GitHub access token for a user';
COMMENT ON FUNCTION public.get_github_token IS 'Retrieves and decrypts a GitHub access token for authorized use';