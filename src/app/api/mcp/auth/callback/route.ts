import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateAuthCode, storeAuthCode } from '@/lib/mcp/auth-codes'

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
      console.error('[MCP Debug] Decoded callback data:', mcpData)
    } catch (e) {
      console.error('[MCP Debug] Failed to decode callback data:', e)
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

  // Get the authenticated user (not just session for security)
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    // Redirect back to auth if not authenticated
    const authUrl = new URL('/api/mcp/auth', request.nextUrl.origin)
    authUrl.searchParams.set('redirect_uri', redirect_uri)
    if (state) authUrl.searchParams.set('state', state)
    return NextResponse.redirect(authUrl)
  }

  // We have an authenticated user! Generate an authorization code
  // OAuth2 expects a short, opaque authorization code like Stripe's
  const authCode = generateAuthCode()
  
  // Store the user data associated with this code
  storeAuthCode(authCode, user.id, user.email || '')
  
  // Log what we're sending back to Claude
  console.error('[MCP Debug] Sending authorization code back to Claude:', {
    redirect_uri,
    state,
    codeLength: authCode.length,
    userId: user.id
  })
  
  // Get user's team info for additional context
  const { data: teamMember } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('user_id', user.id)
    .single()
  
  const callbackUrl = new URL(redirect_uri)
  callbackUrl.searchParams.set('code', authCode)
  if (state) callbackUrl.searchParams.set('state', state)
  
  // Add additional context like Stripe does
  callbackUrl.searchParams.set('user_id', user.id)
  if (teamMember?.team_id) {
    callbackUrl.searchParams.set('team_id', teamMember.team_id)
    callbackUrl.searchParams.set('workspace_id', `team:${teamMember.team_id}`)
  } else {
    callbackUrl.searchParams.set('workspace_id', `user:${user.id}`)
  }
  
  // Log the complete redirect URL we're sending back
  console.error('[MCP Debug] ===========================================')
  console.error('[MCP Debug] FINAL REDIRECT TO CLAUDE:')
  console.error('[MCP Debug] Full URL:', callbackUrl.toString())
  console.error('[MCP Debug] Parameters:')
  console.error('[MCP Debug]   - code:', authCode)
  console.error('[MCP Debug]   - state:', state)
  console.error('[MCP Debug]   - user_id:', user.id)
  console.error('[MCP Debug]   - workspace_id:', teamMember?.team_id ? `team:${teamMember.team_id}` : `user:${user.id}`)
  if (teamMember?.team_id) {
    console.error('[MCP Debug]   - team_id:', teamMember.team_id)
  }
  console.error('[MCP Debug] ===========================================')
  
  return NextResponse.redirect(callbackUrl)
}