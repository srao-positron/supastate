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

  // For MCP, we expect a specific client ID
  if (clientId !== 'mcp-supastate') {
    return NextResponse.json({ 
      error: 'invalid_client',
      error_description: 'Unknown client' 
    }, { status: 401 })
  }

  // Get current user session
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    // Redirect to login page with return URL
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('returnTo', request.url)
    return NextResponse.redirect(loginUrl)
  }

  // Generate authorization code
  const code = crypto.randomUUID()
  
  // Store auth code with user info and PKCE challenge (expires in 10 minutes)
  const { error: storeError } = await supabase
    .from('mcp_auth_codes')
    .insert({
      code,
      user_id: user.id,
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    })

  if (storeError) {
    console.error('Failed to store auth code:', storeError)
    return NextResponse.json({ 
      error: 'server_error',
      error_description: 'Failed to generate authorization code' 
    }, { status: 500 })
  }

  // Redirect back to client with authorization code
  const callbackUrl = new URL(redirectUri)
  callbackUrl.searchParams.set('code', code)
  callbackUrl.searchParams.set('state', state)
  
  return NextResponse.redirect(callbackUrl)
}