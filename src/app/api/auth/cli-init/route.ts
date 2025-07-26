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
  
  // Generate OAuth URL with server-side flow
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: `${request.headers.get('origin')}/auth/cli/callback?port=${port}`,
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