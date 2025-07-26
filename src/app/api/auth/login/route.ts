/**
 * Login endpoint for Camille CLI
 * Returns JWT tokens after email/password authentication
 */

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { log } from '@/lib/logger'

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json()
    
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password required' },
        { status: 400 }
      )
    }
    
    // Create Supabase client
    const supabase = await createClient()
    
    // Authenticate with email/password
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    
    if (authError || !authData.user || !authData.session) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }
    
    // Return the JWT tokens and user info
    return NextResponse.json({
      accessToken: authData.session.access_token,
      refreshToken: authData.session.refresh_token,
      expiresIn: authData.session.expires_in,
      expiresAt: authData.session.expires_at,
      userId: authData.user.id,
      email: authData.user.email,
      action: 'authenticated',
      message: 'Successfully authenticated with Supabase'
    })
    
  } catch (error) {
    log.error('Login error', error)
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500 }
    )
  }
}