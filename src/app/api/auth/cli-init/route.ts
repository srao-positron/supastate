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
  
  // Parse the auth URL to add our own state parameter
  const authUrl = new URL(data.url)
  
  // Add a custom state parameter to identify CLI auth
  // We'll append it to whatever state Supabase already set
  const existingState = authUrl.searchParams.get('state') || ''
  const cliState = Buffer.from(JSON.stringify({ cli: true, port, t: Date.now() })).toString('base64url')
  authUrl.searchParams.set('state', `${existingState}|CLI:${cliState}`)
  
  // Redirect the browser to the OAuth URL with our CLI state embedded
  return NextResponse.redirect(authUrl.toString())
}