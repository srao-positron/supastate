/**
 * Initialize CLI authentication flow
 * This endpoint starts the OAuth flow for CLI authentication
 */

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const port = searchParams.get('port') || '8899'
  
  // Create Supabase client
  const supabase = await createClient()
  
  // Use the proper base URL for redirect
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || origin || 'https://www.supastate.ai'
  
  // Generate OAuth URL with server-side flow
  // The redirectTo needs to be the actual callback handler that Supabase will redirect to
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: `${baseUrl}/auth/callback?cli=true&port=${port}`,
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
  
  // Return the OAuth URL for the CLI to open
  return NextResponse.json({
    authUrl: data.url
  })
}