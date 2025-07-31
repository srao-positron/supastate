import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  
  // Get the original OAuth parameters that were passed to authorize
  const clientId = searchParams.get('client_id')
  const redirectUri = searchParams.get('redirect_uri')
  const state = searchParams.get('state')
  const codeChallenge = searchParams.get('code_challenge')
  const codeChallengeMethod = searchParams.get('code_challenge_method')
  
  // Verify user is now authenticated after Supabase OAuth
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  
  if (error || !user) {
    return NextResponse.json({ 
      error: 'access_denied',
      error_description: 'Authentication failed' 
    }, { status: 401 })
  }
  
  // Generate authorization code with user info
  const code = Buffer.from(JSON.stringify({
    user_id: user.id,
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
    expires: Date.now() + 10 * 60 * 1000,
    nonce: crypto.randomUUID()
  })).toString('base64url')
  
  // Redirect back to MCP client with code
  const callbackUrl = new URL(redirectUri!)
  callbackUrl.searchParams.set('code', code)
  if (state) {
    callbackUrl.searchParams.set('state', state)
  }
  
  return NextResponse.redirect(callbackUrl)
}