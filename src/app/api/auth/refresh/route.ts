/**
 * Refresh token endpoint for Camille CLI
 * Exchanges refresh token for new access token
 */

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { log } from '@/lib/logger'

export async function POST(request: Request) {
  try {
    const { refreshToken } = await request.json()
    
    if (!refreshToken) {
      return NextResponse.json(
        { error: 'Refresh token required' },
        { status: 400 }
      )
    }
    
    // Create Supabase client
    const supabase = await createClient()
    
    // Set the refresh token and refresh the session
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken
    })
    
    if (error || !data.session) {
      return NextResponse.json(
        { error: 'Invalid or expired refresh token' },
        { status: 401 }
      )
    }
    
    // Return the new tokens
    return NextResponse.json({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresIn: data.session.expires_in,
      expiresAt: data.session.expires_at,
      userId: data.user?.id,
      email: data.user?.email,
      message: 'Token refreshed successfully'
    })
    
  } catch (error) {
    log.error('Token refresh error', error)
    return NextResponse.json(
      { error: 'Failed to refresh token' },
      { status: 500 }
    )
  }
}