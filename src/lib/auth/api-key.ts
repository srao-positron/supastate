/**
 * API Key authentication utilities
 */

import { createServiceClient } from '@/lib/supabase/server'
import { createHash } from 'crypto'

export interface AuthResult {
  authenticated: boolean
  userId?: string
  teamId?: string
  error?: string
}

/**
 * Verify API key and return associated user/team
 */
export async function verifyApiKey(apiKey: string): Promise<AuthResult> {
  try {
    // Hash the API key
    const keyHash = createHash('sha256').update(apiKey).digest('hex')
    
    // Use service client to verify API key
    const supabase = await createServiceClient()
    
    const { data, error } = await supabase
      .from('api_keys')
      .select('id, team_id, user_id, is_active')
      .eq('key_hash', keyHash)
      .eq('is_active', true)
      .single()
    
    if (error || !data) {
      return {
        authenticated: false,
        error: 'Invalid API key'
      }
    }
    
    // Update last used timestamp
    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', data.id)
    
    return {
      authenticated: true,
      userId: data.user_id,
      teamId: data.team_id
    }
  } catch (error) {
    console.error('API key verification error:', error)
    return {
      authenticated: false,
      error: 'Authentication failed'
    }
  }
}

/**
 * Create a new API key for a user
 */
export async function createApiKey(
  userId: string, 
  name: string,
  teamId?: string
): Promise<{ apiKey?: string; error?: string }> {
  try {
    const supabase = await createServiceClient()
    
    // Generate a secure random key
    const apiKey = `sk_${crypto.randomBytes(24).toString('base64url')}`
    const keyHash = createHash('sha256').update(apiKey).digest('hex')
    
    const { error } = await supabase
      .from('api_keys')
      .insert({
        user_id: userId,
        team_id: teamId,
        name,
        key_hash: keyHash,
        is_active: true
      })
    
    if (error) {
      return { error: error.message }
    }
    
    // Return the unhashed key (only shown once)
    return { apiKey }
  } catch (error) {
    console.error('API key creation error:', error)
    return { error: 'Failed to create API key' }
  }
}