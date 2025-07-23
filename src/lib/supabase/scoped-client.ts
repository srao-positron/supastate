/**
 * Scoped Supabase client for API key authentication
 * Uses service role with user context for RLS
 */

import { createServiceClient } from './server'
import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Create a Supabase client scoped to a specific user
 * This allows service-level operations while respecting RLS
 */
export async function createScopedClient(userId: string): Promise<SupabaseClient> {
  const client = await createServiceClient()
  
  // Set the user context for RLS policies
  // This is a PostgreSQL session variable that RLS policies can access
  await client.rpc('set_config', {
    setting: 'request.jwt.claims',
    value: JSON.stringify({ sub: userId }),
    is_local: true
  })
  
  return client
}

/**
 * Create a function in the database to set user context
 * This should be added as a migration
 */
export const SET_USER_CONTEXT_FUNCTION = `
CREATE OR REPLACE FUNCTION set_user_context(user_id UUID)
RETURNS void AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', user_id::text)::text, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
`