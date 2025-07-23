/**
 * Exchange Supabase auth token for API key
 * This is called by Camille after successful Supabase login
 */

import { createClient } from '@/lib/supabase/server'
import { createApiKey } from '@/lib/auth/api-key'
import { NextResponse } from 'next/server'
import { createHash } from 'crypto'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { code } = body
    
    // Support both code exchange and bearer token
    let accessToken: string | null = null
    
    if (code) {
      // Exchange code for session
      const supabase = await createClient()
      const { data: authData, error: authError } = await supabase.auth.exchangeCodeForSession(code)
      
      if (authError || !authData.session) {
        return NextResponse.json(
          { error: 'Invalid authorization code' },
          { status: 401 }
        )
      }
      
      accessToken = authData.session.access_token
    } else {
      // Get token from header
      const authHeader = request.headers.get('authorization')
      if (!authHeader?.startsWith('Bearer ')) {
        return NextResponse.json(
          { error: 'Missing authorization token or code' },
          { status: 401 }
        )
      }
      accessToken = authHeader.substring(7)
    }
    
    // Create a Supabase client with the user's token
    const supabase = await createClient()
    
    // Verify the token and get user info
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken)
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      )
    }
    
    // Check if user already has an API key for Camille
    const { data: existingKey } = await supabase
      .from('api_keys')
      .select('id, name, created_at')
      .eq('user_id', user.id)
      .eq('name', 'Camille CLI')
      .eq('is_active', true)
      .single()
    
    if (existingKey) {
      // User already has a Camille API key
      // For security, we don't return existing keys
      return NextResponse.json({
        message: 'API key already exists for Camille CLI',
        keyId: existingKey.id,
        createdAt: existingKey.created_at,
        action: 'existing'
      })
    }
    
    // Create a new API key for Camille
    const result = await createApiKey(user.id, 'Camille CLI')
    
    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      )
    }
    
    // Return the new API key
    return NextResponse.json({
      apiKey: result.apiKey,
      userId: user.id,
      email: user.email,
      action: 'created',
      message: 'API key created for Camille CLI'
    })
    
  } catch (error) {
    console.error('[Exchange Token] Error:', error)
    return NextResponse.json(
      { error: 'Failed to exchange token' },
      { status: 500 }
    )
  }
}