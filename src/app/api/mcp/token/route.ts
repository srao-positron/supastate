import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { grant_type, code, redirect_uri, client_id, code_verifier } = body

    // For MCP, we support a simplified flow
    if (grant_type !== 'authorization_code') {
      return NextResponse.json({ 
        error: 'unsupported_grant_type',
        error_description: 'Only authorization_code grant type is supported' 
      }, { status: 400 })
    }

    if (!code) {
      return NextResponse.json({ 
        error: 'invalid_request',
        error_description: 'Missing authorization code' 
      }, { status: 400 })
    }

    // Decode the authorization code
    let codeData
    try {
      codeData = JSON.parse(Buffer.from(code, 'base64url').toString())
    } catch (e) {
      return NextResponse.json({ 
        error: 'invalid_grant',
        error_description: 'Invalid authorization code' 
      }, { status: 400 })
    }

    // Get Supabase session for the user
    const supabase = await createClient()
    const { data: { session }, error } = await supabase.auth.getSession()
    
    if (error || !session) {
      return NextResponse.json({ 
        error: 'invalid_grant',
        error_description: 'No active session found' 
      }, { status: 400 })
    }

    // Return the Supabase access token
    // MCP clients can use this token to authenticate with our server
    return NextResponse.json({
      access_token: session.access_token,
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: session.refresh_token,
      scope: 'read write'
    })

  } catch (error) {
    console.error('Token exchange error:', error)
    return NextResponse.json({ 
      error: 'server_error',
      error_description: 'Internal server error' 
    }, { status: 500 })
  }
}