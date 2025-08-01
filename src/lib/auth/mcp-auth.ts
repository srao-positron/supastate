import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export interface AuthInfo {
  authenticated: boolean
  userId?: string
  workspaceId?: string
  error?: string
}

/**
 * Extract and validate authentication from MCP request
 * Returns auth info or null if no auth present (for public tools)
 */
export async function getMcpAuth(request: NextRequest): Promise<AuthInfo | null> {
  // Check for Authorization header
  const authHeader = request.headers.get('authorization')
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }

  const token = authHeader.slice(7)
  
  try {
    // Try to decode our base64 token format first
    const tokenData = JSON.parse(Buffer.from(token, 'base64url').toString())
    
    // Validate token hasn't expired
    if (tokenData.expires_at && tokenData.expires_at < Date.now()) {
      return {
        authenticated: false,
        error: 'Token expired'
      }
    }
    
    // Get user info
    const supabase = createServiceClient()
    const { data: userData } = await supabase.auth.admin.getUserById(tokenData.user_id)
    
    if (!userData.user) {
      return {
        authenticated: false,
        error: 'Invalid user'
      }
    }
    
    // Get workspace info
    const { data: userRecord } = await supabase
      .from('users')
      .select('id, team_id')
      .eq('id', tokenData.user_id)
      .single()
    
    const workspaceId = userRecord?.team_id ? `team:${userRecord.team_id}` : `user:${tokenData.user_id}`
    
    return {
      authenticated: true,
      userId: tokenData.user_id,
      workspaceId
    }
  } catch (e) {
    // If our token format fails, try Supabase JWT
    try {
      const supabase = await createClient()
      const { data: { user }, error } = await supabase.auth.getUser(token)
      
      if (error || !user) {
        return {
          authenticated: false,
          error: 'Invalid token'
        }
      }
      
      // Get workspace info
      const { data: userData } = await supabase
        .from('users')
        .select('id, team_id')
        .eq('id', user.id)
        .single()
      
      const workspaceId = userData?.team_id ? `team:${userData.team_id}` : `user:${user.id}`
      
      return {
        authenticated: true,
        userId: user.id,
        workspaceId
      }
    } catch (e2) {
      return {
        authenticated: false,
        error: 'Invalid token format'
      }
    }
  }
}

/**
 * Create a WWW-Authenticate header for 401 responses
 */
export function createAuthenticateHeader(): string {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.supastate.ai'
  return `Bearer realm="${baseUrl}", as_uri="${baseUrl}/.well-known/oauth-protected-resource"`
}