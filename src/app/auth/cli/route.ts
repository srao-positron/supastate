import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import { createHash, randomBytes } from 'crypto'

/**
 * CLI authentication endpoint for Camille
 * Redirects to GitHub OAuth and returns API key to CLI callback
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const client = searchParams.get('client')
  const state = searchParams.get('state')
  const callback = searchParams.get('callback')
  
  // Validate required parameters
  if (client !== 'camille' || !state || !callback) {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
  }
  
  try {
    // Store CLI auth state in cookies
    const response = NextResponse.redirect(
      new URL('/auth/github', request.url)
    )
    
    // Set secure cookies for state validation
    response.cookies.set('cli_auth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 10 // 10 minutes
    })
    
    response.cookies.set('cli_callback', callback, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 10 // 10 minutes
    })
    
    response.cookies.set('cli_auth', 'true', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 10 // 10 minutes
    })
    
    return response
  } catch (error) {
    console.error('[CLI Auth] Error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

/**
 * Handle the callback after GitHub OAuth
 * This is called by the auth callback route when CLI auth is detected
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