import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/memories'
  
  // Check for CLI session from cookie
  let isCli = false
  let port = '8899'
  
  const cookieStore = await cookies()
  const cliSessionCookie = cookieStore.get('cli_auth_session')
  
  if (cliSessionCookie) {
    try {
      const cliSession = JSON.parse(cliSessionCookie.value)
      // Check if this is a recent CLI auth request (within 10 minutes)
      if (cliSession.isCli === true && cliSession.timestamp && (Date.now() - cliSession.timestamp) < 600000) {
        isCli = true
        port = cliSession.port || '8899'
      }
    } catch (e) {
      console.error('[Auth Callback] Failed to parse CLI session cookie:', e)
    }
    
    // Always delete the cookie after checking it, regardless of validity
    // This ensures we don't affect future non-CLI logins
    cookieStore.delete('cli_auth_session')
  }

  console.log('[Auth Callback] Received callback:', {
    code: code ? 'present' : 'missing',
    isCli,
    port,
    hasCLISessionCookie: !!cliSessionCookie,
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
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error && data?.session) {
      // Debug: Log what we receive from Supabase
      console.log('[Auth Callback] Session data:', {
        hasProviderToken: !!data.session.provider_token,
        hasProviderRefreshToken: !!data.session.provider_refresh_token,
        userMetadata: data.session.user?.user_metadata,
        sessionKeys: Object.keys(data.session)
      })
      
      // Capture GitHub access token if available
      const providerToken = data.session.provider_token
      const providerRefreshToken = data.session.provider_refresh_token
      
      if (providerToken) {
        console.log('[Auth Callback] Storing GitHub token for user')
        
        // Get user info to extract GitHub username and scopes
        const { data: { user } } = await supabase.auth.getUser()
        
        if (user) {
          // Store the GitHub token securely
          const { error: storeError } = await supabase.rpc('store_github_token', {
            user_id: user.id,
            token: providerToken,
            scopes: ['read:user', 'user:email', 'repo'], // These were requested in the OAuth flow
            username: user.user_metadata?.user_name || null
          })
          
          if (storeError) {
            console.error('[Auth Callback] Failed to store GitHub token:', storeError)
          } else {
            console.log('[Auth Callback] GitHub token stored successfully')
          }
        }
      } else {
        console.log('[Auth Callback] No provider token in session')
      }
      
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