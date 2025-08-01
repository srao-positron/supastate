import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// This endpoint handles MCP authentication
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const redirect_uri = searchParams.get('redirect_uri')
  const client_id = searchParams.get('client_id')
  const state = searchParams.get('state')
  
  if (!redirect_uri) {
    return NextResponse.json(
      { error: 'Missing redirect_uri parameter' },
      { status: 400 }
    )
  }

  // Check if user is authenticated
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    // Store MCP parameters in session and redirect to our standard login
    const loginUrl = new URL('/auth/login', request.nextUrl.origin)
    // Encode the MCP callback info so we can resume after login
    const mcpCallback = Buffer.from(JSON.stringify({
      redirect_uri,
      client_id,
      state,
      type: 'mcp_auth'
    })).toString('base64url')
    
    loginUrl.searchParams.set('redirect_to', `/api/mcp/auth/callback?data=${mcpCallback}`)
    
    return NextResponse.redirect(loginUrl)
  }

  // User is authenticated, redirect to callback to complete the flow
  const callbackUrl = new URL('/api/mcp/auth/callback', request.nextUrl.origin)
  callbackUrl.searchParams.set('redirect_uri', redirect_uri)
  if (client_id) callbackUrl.searchParams.set('client_id', client_id)
  if (state) callbackUrl.searchParams.set('state', state)
  
  return NextResponse.redirect(callbackUrl)
}