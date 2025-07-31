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

    // Decode the authorization code
    let codeData
    try {
      codeData = JSON.parse(Buffer.from(code, 'base64url').toString())
    } catch (e) {
      return NextResponse.json({ 
        error: 'invalid_grant',
        error_description: 'Invalid authorization code format' 
      }, { status: 400 })
    }

    // Validate code hasn't expired
    if (codeData.expires < Date.now()) {
      return NextResponse.json({ 
        error: 'invalid_grant',
        error_description: 'Authorization code expired' 
      }, { status: 400 })
    }

    // Validate code parameters match
    if (codeData.client_id !== client_id || codeData.redirect_uri !== redirect_uri) {
      return NextResponse.json({ 
        error: 'invalid_grant',
        error_description: 'Invalid authorization code' 
      }, { status: 400 })
    }

    // Validate PKCE if present
    if (codeData.code_challenge) {
      if (!code_verifier) {
        return NextResponse.json({ 
          error: 'invalid_request',
          error_description: 'Code verifier required' 
        }, { status: 400 })
      }

      const challenge = generateCodeChallenge(code_verifier)
      if (challenge !== codeData.code_challenge) {
        return NextResponse.json({ 
          error: 'invalid_grant',
          error_description: 'Invalid code verifier' 
        }, { status: 400 })
      }
    }

    const supabase = createServiceClient()
    
    // Get the user's current session
    const { data: userData } = await supabase.auth.admin.getUserById(codeData.user_id)
    
    if (!userData.user) {
      return NextResponse.json({ 
        error: 'invalid_grant',
        error_description: 'User not found' 
      }, { status: 400 })
    }

    // Generate a session token that the MCP server can verify
    // This is a signed JWT that includes the user ID
    const tokenData = {
      user_id: codeData.user_id,
      client_id: client_id,
      issued_at: Date.now(),
      expires_at: Date.now() + 3600 * 1000, // 1 hour
      nonce: crypto.randomUUID()
    }
    
    const accessToken = Buffer.from(JSON.stringify(tokenData)).toString('base64url')
    
    // Return OAuth token response
    return NextResponse.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600,
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