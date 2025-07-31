import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_REDIRECT_HOSTS = [
  'http://localhost',
  'https://localhost',
  'claude://oauth-callback',
  'vscode://oauth-callback',
  'http://127.0.0.1',
  'https://127.0.0.1'
]

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const clientId = searchParams.get('client_id')
  const redirectUri = searchParams.get('redirect_uri')
  const state = searchParams.get('state')
  const codeChallenge = searchParams.get('code_challenge')
  const codeChallengeMethod = searchParams.get('code_challenge_method')

  // Validate required OAuth parameters
  if (!clientId || !redirectUri || !state) {
    return NextResponse.json({ 
      error: 'invalid_request',
      error_description: 'Missing required parameters' 
    }, { status: 400 })
  }

  // Validate redirect URI is allowed
  const redirectUrl = new URL(redirectUri)
  const isAllowed = ALLOWED_REDIRECT_HOSTS.some(host => 
    redirectUri.startsWith(host)
  )
  
  if (!isAllowed) {
    return NextResponse.json({ 
      error: 'invalid_request',
      error_description: 'Redirect URI not allowed' 
    }, { status: 400 })
  }

  // For MCP, we allow any client ID (dynamic registration)
  // The client_id is just used for tracking

  // Get current user session
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    // Redirect to Supabase login with return URL
    const { data: { url } } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `${request.nextUrl.origin}/api/mcp/oauth/callback?${searchParams.toString()}`
      }
    })
    
    if (url) {
      return NextResponse.redirect(url)
    }
    
    // Fallback to login page
    const loginUrl = new URL('/auth/login', request.url)
    loginUrl.searchParams.set('returnTo', request.url)
    return NextResponse.redirect(loginUrl)
  }

  // User is authenticated, generate a temporary code
  // We'll use a signed JWT that includes the user ID and expires in 10 minutes
  const code = Buffer.from(JSON.stringify({
    user_id: user.id,
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
    expires: Date.now() + 10 * 60 * 1000,
    nonce: crypto.randomUUID()
  })).toString('base64url')

  // Redirect back to client with authorization code
  const callbackUrl = new URL(redirectUri)
  callbackUrl.searchParams.set('code', code)
  callbackUrl.searchParams.set('state', state)
  
  return NextResponse.redirect(callbackUrl)
}