import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  
  // Check if we have encoded MCP data
  const data = searchParams.get('data')
  let redirect_uri: string | null = null
  let state: string | null = null
  
  if (data) {
    // Decode MCP callback data
    try {
      const mcpData = JSON.parse(Buffer.from(data, 'base64url').toString())
      redirect_uri = mcpData.redirect_uri
      state = mcpData.state
    } catch (e) {
      return NextResponse.json(
        { error: 'Invalid callback data' },
        { status: 400 }
      )
    }
  } else {
    // Direct parameters
    redirect_uri = searchParams.get('redirect_uri')
    state = searchParams.get('state')
  }
  
  if (!redirect_uri) {
    return NextResponse.json(
      { error: 'Missing redirect_uri parameter' },
      { status: 400 }
    )
  }

  // Get the authenticated user and session
  const supabase = await createClient()
  const { data: { session }, error } = await supabase.auth.getSession()

  if (error || !session) {
    // Redirect back to auth if not authenticated
    const authUrl = new URL('/api/mcp/auth', request.nextUrl.origin)
    authUrl.searchParams.set('redirect_uri', redirect_uri)
    if (state) authUrl.searchParams.set('state', state)
    return NextResponse.redirect(authUrl)
  }

  // We have a session! Generate an authorization code
  // OAuth2 expects an authorization code, not the token directly
  const authCode = Buffer.from(JSON.stringify({
    userId: session.user.id,
    exp: Date.now() + 5 * 60 * 1000, // 5 minutes
    sessionId: session.access_token.substring(0, 8), // For tracking
  })).toString('base64url')
  
  const callbackUrl = new URL(redirect_uri)
  callbackUrl.searchParams.set('code', authCode)
  if (state) callbackUrl.searchParams.set('state', state)
  
  return NextResponse.redirect(callbackUrl)
}