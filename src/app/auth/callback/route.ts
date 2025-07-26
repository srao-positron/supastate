import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/memories'
  const state = searchParams.get('state') || ''
  
  // Check for CLI auth in state parameter
  let isCli = false
  let port = '8899'
  
  // Look for our CLI marker in the state
  if (state.includes('|CLI:')) {
    try {
      const cliPart = state.split('|CLI:')[1]
      if (cliPart) {
        const cliData = JSON.parse(Buffer.from(cliPart, 'base64url').toString())
        // Check if this is a recent CLI auth request (within 10 minutes)
        if (cliData.cli === true && cliData.t && (Date.now() - cliData.t) < 600000) {
          isCli = true
          port = cliData.port || '8899'
        }
      }
    } catch (e) {
      console.error('[Auth Callback] Failed to parse CLI state:', e)
    }
  }

  console.log('[Auth Callback] Received callback:', {
    code: code ? 'present' : 'missing',
    isCli,
    port,
    state: state ? 'present' : 'missing',
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