import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// This endpoint handles MCP authentication
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const redirect_uri = searchParams.get('redirect_uri')
  const client_id = searchParams.get('client_id')
  const state = searchParams.get('state')
  const response_type = searchParams.get('response_type')
  const code_challenge = searchParams.get('code_challenge')
  const code_challenge_method = searchParams.get('code_challenge_method')
  
  // Log OAuth request from Claude
  console.error('[MCP Debug] OAuth authorization request:', {
    redirect_uri,
    client_id,
    state,
    response_type,
    code_challenge: code_challenge ? 'present' : 'missing',
    code_challenge_method,
    allParams: Object.fromEntries(searchParams.entries())
  })
  
  if (!redirect_uri) {
    return NextResponse.json(
      { error: 'Missing redirect_uri parameter' },
      { status: 400 }
    )
  }

  // Check if redirect_uri is to Claude's callback endpoint
  const isClaudeCallback = redirect_uri.includes('claude.ai/api/mcp/auth_callback')
  console.error('[MCP Debug] Is Claude callback URL:', isClaudeCallback, redirect_uri)

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
      response_type,
      code_challenge,
      code_challenge_method,
      type: 'mcp_auth'
    })).toString('base64url')
    
    loginUrl.searchParams.set('redirect_to', `/api/mcp/auth/callback?data=${mcpCallback}`)
    
    console.error('[MCP Debug] Redirecting to login, will return to:', `/api/mcp/auth/callback?data=${mcpCallback}`)
    
    return NextResponse.redirect(loginUrl)
  }

  // User is authenticated, redirect to callback to complete the flow
  const callbackUrl = new URL('/api/mcp/auth/callback', request.nextUrl.origin)
  callbackUrl.searchParams.set('redirect_uri', redirect_uri)
  if (client_id) callbackUrl.searchParams.set('client_id', client_id)
  if (state) callbackUrl.searchParams.set('state', state)
  
  console.error('[MCP Debug] User already authenticated, redirecting to callback')
  console.error('[MCP Debug] Callback URL:', callbackUrl.toString())
  
  return NextResponse.redirect(callbackUrl)
}