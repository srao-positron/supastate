import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/supabase'

/**
 * Create a Supabase client for service-level operations
 * This bypasses Row Level Security (RLS) and should only be used in secure server-side contexts
 */
export function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables')
  }

  return createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}