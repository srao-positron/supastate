import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/memories'
  const isCli = searchParams.get('cli') === 'true'
  const port = searchParams.get('port')

  console.log('[Auth Callback] Received callback:', {
    code: code ? 'present' : 'missing',
    isCli,
    port,
    url: request.url
  })

  // If this is a CLI authentication, redirect to the CLI callback handler
  if (isCli) {
    if (!code) {
      console.error('[Auth Callback] CLI callback missing code')
      return NextResponse.redirect(`${origin}/auth/login?error=no_code`)
    }
    
    console.log('[Auth Callback] Redirecting to CLI callback handler')
    const cliCallbackUrl = new URL(`${origin}/auth/cli/callback`)
    cliCallbackUrl.searchParams.set('code', code)
    if (port) {
      cliCallbackUrl.searchParams.set('port', port)
    }
    return NextResponse.redirect(cliCallbackUrl.toString())
  }

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error) {
      // Successful authentication
      return NextResponse.redirect(`${origin}${next}`)
    } else {
      console.error('[Auth Callback] Failed to exchange code:', error)
    }
  } else {
    console.error('[Auth Callback] No code in callback URL')
  }

  // Return the user to an error page with error details
  return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`)
}