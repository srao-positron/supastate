/**
 * Initialize CLI authentication flow
 * This endpoint starts the OAuth flow for CLI authentication
 */

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const port = searchParams.get('port') || '8899'
  
  // Store CLI session info in a cookie
  const cliSessionCookie = JSON.stringify({ port, isCli: true, timestamp: Date.now() })
  
  // Create Supabase client
  const supabase = await createClient()
  
  // Use a fixed redirect URL that Supabase is configured to use
  // We'll detect CLI auth by the presence of the cookie
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: 'https://www.supastate.ai/auth/callback',
      scopes: 'read:user user:email',
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  })
  
  if (error || !data.url) {
    return NextResponse.json(
      { error: 'Failed to initialize OAuth flow' },
      { status: 500 }
    )
  }
  
  // Return the auth URL and set the CLI session cookie
  const response = NextResponse.json({ authUrl: data.url })
  
  response.cookies.set('cli_auth_session', cliSessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/'
  })
  
  return response
}