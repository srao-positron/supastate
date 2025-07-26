/**
 * Initialize CLI authentication flow
 * This endpoint starts the OAuth flow for CLI authentication
 */

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const port = searchParams.get('port') || '8899'
  
  // Create Supabase client
  const supabase = await createClient()
  
  // Generate OAuth URL with GitHub
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
  
  // Create response that will redirect to OAuth
  const response = NextResponse.redirect(data.url)
  
  // Set a cookie that works across subdomains
  response.cookies.set('cli_auth_session', JSON.stringify({ port, isCli: true, timestamp: Date.now() }), {
    httpOnly: true,
    secure: true, // Always use secure in production
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
    domain: '.supastate.ai' // This makes it available to both www.supastate.ai and supastate.ai
  })
  
  return response
}