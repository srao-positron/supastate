/**
 * Refresh token endpoint for Camille CLI
 * Exchanges refresh token for new access token
 */

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { log } from '@/lib/logger'
import { cookies } from 'next/headers'

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
      log.error('Refresh session error:', error)
      
      // Provide more specific error messages
      if (error?.message?.includes('expired')) {
        return NextResponse.json(
          { error: 'Refresh token has expired. Please login again.' },
          { status: 401 }
        )
      }
      
      if (error?.message?.includes('invalid')) {
        return NextResponse.json(
          { error: 'Invalid refresh token. Please login again.' },
          { status: 401 }
        )
      }
      
      return NextResponse.json(
        { error: error?.message || 'Invalid or expired refresh token' },
        { status: 401 }
      )
    }
    
    // Create response with new tokens
    const response = NextResponse.json({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresIn: data.session.expires_in,
      expiresAt: data.session.expires_at,
      userId: data.user?.id,
      email: data.user?.email,
      message: 'Token refreshed successfully'
    })
    
    // Also set cookies for browser-based access if needed
    const cookieStore = await cookies()
    const expiresAt = new Date(data.session.expires_at! * 1000)
    
    // Set auth cookies (httpOnly for security)
    cookieStore.set('sb-access-token', data.session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: expiresAt,
      path: '/',
    })
    
    cookieStore.set('sb-refresh-token', data.session.refresh_token!, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      path: '/',
    })
    
    return response
    
  } catch (error) {
    log.error('Token refresh error', error)
    return NextResponse.json(
      { error: 'Failed to refresh token. Please try again or login if the problem persists.' },
      { status: 500 }
    )
  }
}