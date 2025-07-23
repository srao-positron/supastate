import { createServiceClient } from '@/lib/supabase/server'
import { createHash, randomBytes } from 'crypto'

/**
 * Create an API key for CLI authentication
 */
export async function createCliApiKey(userId: string, userEmail: string) {
  console.log('[CLI Auth] Creating API key for user:', userId)
  
  try {
    const serviceClient = await createServiceClient()
    
    // Generate a secure API key
    const apiKey = `supa_${randomBytes(32).toString('base64url')}`
    const keyHash = createHash('sha256').update(apiKey).digest('hex')
    
    // Create API key record
    const { data: apiKeyData, error: apiKeyError } = await serviceClient
      .from('api_keys')
      .insert({
        user_id: userId,
        name: `Camille CLI (${new Date().toISOString().split('T')[0]})`,
        key_hash: keyHash,
        is_active: true,
        created_at: new Date().toISOString()
      })
      .select('id')
      .single()
    
    if (apiKeyError) {
      console.error('[CLI Auth] Failed to create API key:', apiKeyError)
      throw apiKeyError
    }
    
    console.log('[CLI Auth] API key created successfully')
    return { apiKey, userId }
  } catch (error) {
    console.error('[CLI Auth] Error creating API key:', error)
    throw error
  }
}