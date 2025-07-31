-- Ensure pgcrypto is properly enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Drop existing functions if they exist
DROP FUNCTION IF EXISTS public.store_github_token CASCADE;
DROP FUNCTION IF EXISTS public.get_github_token CASCADE;

-- Recreate the store function with proper extension reference
CREATE OR REPLACE FUNCTION public.store_github_token(
  user_id uuid,
  token text,
  scopes text[] DEFAULT NULL,
  username text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  encryption_key text;
BEGIN
  -- Generate a user-specific encryption key
  encryption_key := encode(
    extensions.digest(
      user_id::text || current_database() || 'github_token_v1',
      'sha256'
    ),
    'hex'
  );

  -- Update the user record with encrypted token
  UPDATE users
  SET 
    github_access_token_encrypted = encode(
      extensions.encrypt(
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

-- Recreate the get function with proper extension reference
CREATE OR REPLACE FUNCTION public.get_github_token(
  user_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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
    extensions.digest(
      user_id::text || current_database() || 'github_token_v1',
      'sha256'
    ),
    'hex'
  );

  -- Decrypt and return the token
  BEGIN
    decrypted_token := convert_from(
      extensions.decrypt(
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