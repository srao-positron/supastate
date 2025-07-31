import { createServiceClient } from '@/lib/supabase/service'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

function generateCodeChallenge(verifier: string): string {
  return crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url')
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { grant_type, code, redirect_uri, client_id, code_verifier } = body

    // Validate grant type
    if (grant_type !== 'authorization_code') {
      return NextResponse.json({ 
        error: 'unsupported_grant_type',
        error_description: 'Only authorization_code grant type is supported' 
      }, { status: 400 })
    }

    // Validate required parameters
    if (!code || !redirect_uri || !client_id) {
      return NextResponse.json({ 
        error: 'invalid_request',
        error_description: 'Missing required parameters' 
      }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Retrieve and validate auth code
    const { data: authCode, error: fetchError } = await supabase
      .from('mcp_auth_codes')
      .select('*')
      .eq('code', code)
      .eq('client_id', client_id)
      .eq('redirect_uri', redirect_uri)
      .single()

    if (fetchError || !authCode) {
      return NextResponse.json({ 
        error: 'invalid_grant',
        error_description: 'Invalid authorization code' 
      }, { status: 400 })
    }

    // Check if code is expired
    if (new Date(authCode.expires_at) < new Date()) {
      // Clean up expired code
      await supabase
        .from('mcp_auth_codes')
        .delete()
        .eq('code', code)
      
      return NextResponse.json({ 
        error: 'invalid_grant',
        error_description: 'Authorization code expired' 
      }, { status: 400 })
    }

    // Validate PKCE if present
    if (authCode.code_challenge) {
      if (!code_verifier) {
        return NextResponse.json({ 
          error: 'invalid_request',
          error_description: 'Code verifier required' 
        }, { status: 400 })
      }

      const challenge = generateCodeChallenge(code_verifier)
      if (challenge !== authCode.code_challenge) {
        return NextResponse.json({ 
          error: 'invalid_grant',
          error_description: 'Invalid code verifier' 
        }, { status: 400 })
      }
    }

    // Delete used auth code
    await supabase
      .from('mcp_auth_codes')
      .delete()
      .eq('code', code)

    // Generate access token
    const accessToken = crypto.randomUUID()
    const refreshToken = crypto.randomUUID()
    const expiresIn = 3600 // 1 hour

    // Store tokens
    const { error: tokenError } = await supabase
      .from('mcp_access_tokens')
      .insert({
        token: accessToken,
        refresh_token: refreshToken,
        user_id: authCode.user_id,
        client_id: client_id,
        scopes: ['read'], // Default scopes
        expires_at: new Date(Date.now() + expiresIn * 1000).toISOString()
      })

    if (tokenError) {
      console.error('Failed to store access token:', tokenError)
      return NextResponse.json({ 
        error: 'server_error',
        error_description: 'Failed to generate access token' 
      }, { status: 500 })
    }

    // Return OAuth token response
    return NextResponse.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: expiresIn,
      refresh_token: refreshToken,
      scope: 'read'
    })

  } catch (error) {
    console.error('Token exchange error:', error)
    return NextResponse.json({ 
      error: 'server_error',
      error_description: 'Internal server error' 
    }, { status: 500 })
  }
}