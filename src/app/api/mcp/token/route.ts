import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { SignJWT, jwtVerify } from 'jose'
import { getAuthCode } from '@/lib/mcp/auth-codes'

// MCP Token Exchange Endpoint
// This endpoint exchanges authorization codes for MCP-specific tokens
// As per the Auth0 article, we need to issue our own tokens that Claude can use

const MCP_TOKEN_SECRET = new TextEncoder().encode(
  process.env.MCP_TOKEN_SECRET || 'mcp-token-secret-change-in-production'
)
const MCP_TOKEN_EXPIRY = '24h' // 24 hours
const MCP_REFRESH_EXPIRY = '30d' // 30 days

export async function POST(request: NextRequest) {
  try {
    // Parse form data (OAuth2 uses form encoding, not JSON)
    const contentType = request.headers.get('content-type')
    let body: any = {}
    
    if (contentType?.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData()
      body = Object.fromEntries(formData)
    } else {
      body = await request.json()
    }
    
    const { grant_type, code, redirect_uri, client_id, code_verifier, refresh_token } = body
    
    // Log token exchange request
    console.error('[MCP Debug] Token exchange request:', {
      grant_type,
      code: code ? code.substring(0, 20) + '...' : 'missing',
      redirect_uri,
      client_id,
      code_verifier: code_verifier ? 'present' : 'missing',
      refresh_token: refresh_token ? 'present' : 'missing',
      contentType
    })

    // Handle authorization_code grant
    if (grant_type === 'authorization_code') {
      if (!code) {
        return NextResponse.json({ 
          error: 'invalid_request',
          error_description: 'Missing authorization code' 
        }, { status: 400 })
      }

      // Retrieve the stored auth code data
      const codeData = getAuthCode(code)
      
      if (!codeData) {
        console.error('[MCP Debug] Authorization code not found or expired:', code)
        return NextResponse.json({ 
          error: 'invalid_grant',
          error_description: 'Invalid or expired authorization code' 
        }, { status: 400 })
      }
      
      console.error('[MCP Debug] Retrieved auth code data:', {
        userId: codeData.userId,
        hasEmail: !!codeData.email
      })

      // Get user data from Supabase using the stored user ID
      // Use service client since we don't have auth context in token exchange
      const supabase = createServiceClient()
      console.error('[MCP Debug] Querying users table for userId:', codeData.userId)
      
      const { data: userRecord, error: userError } = await supabase
        .from('users')
        .select('id, email')
        .eq('id', codeData.userId)
        .single()
      
      if (!userRecord || userError) {
        console.error('[MCP Debug] User lookup failed:', userError)
        return NextResponse.json({ 
          error: 'invalid_grant',
          error_description: 'User not found' 
        }, { status: 400 })
      }
      
      // Get user's current team (if any)
      const { data: teamMember } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('user_id', codeData.userId)
        .single()
      
      console.error('[MCP Debug] User query result:', {
        hasUser: !!userRecord,
        userId: userRecord?.id,
        hasTeam: !!teamMember?.team_id,
        teamId: teamMember?.team_id
      })

      // Create our own MCP access token
      const accessToken = await new SignJWT({
        sub: userRecord.id,
        email: userRecord.email,
        workspace_id: teamMember?.team_id ? `team:${teamMember.team_id}` : `user:${userRecord.id}`,
        scope: 'read write',
        client_id: client_id || 'mcp_client',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(MCP_TOKEN_EXPIRY)
        .sign(MCP_TOKEN_SECRET)

      // Create refresh token
      const refreshToken = await new SignJWT({
        sub: userRecord.id,
        type: 'refresh',
        client_id: client_id || 'mcp_client',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(MCP_REFRESH_EXPIRY)
        .sign(MCP_TOKEN_SECRET)

      const response = {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 86400, // 24 hours in seconds
        refresh_token: refreshToken,
        scope: 'read write'
      }
      
      console.error('[MCP Debug] Token exchange successful:', {
        userId: userRecord.id,
        tokenLength: accessToken.length,
        expiresIn: response.expires_in
      })
      
      return NextResponse.json(response)
    }
    
    // Handle refresh_token grant
    if (grant_type === 'refresh_token') {
      if (!refresh_token) {
        return NextResponse.json({ 
          error: 'invalid_request',
          error_description: 'Missing refresh token' 
        }, { status: 400 })
      }

      try {
        // Verify the refresh token
        const { payload } = await jwtVerify(refresh_token, MCP_TOKEN_SECRET)
        
        if (payload.type !== 'refresh') {
          throw new Error('Invalid token type')
        }

        // Get fresh user data from Supabase
        // Use service client since we don't have auth context in token exchange
        const supabase = createServiceClient()
        const { data: userRecord } = await supabase
          .from('users')
          .select('id, email')
          .eq('id', payload.sub)
          .single()
        
        if (!userRecord) {
          throw new Error('User not found')
        }
        
        // Get user's current team (if any)
        const { data: teamMember } = await supabase
          .from('team_members')
          .select('team_id')
          .eq('user_id', payload.sub as string)
          .single()

        // Issue new access token
        const accessToken = await new SignJWT({
          sub: userRecord.id,
          email: userRecord.email,
          workspace_id: teamMember?.team_id ? `team:${teamMember.team_id}` : `user:${userRecord.id}`,
          scope: 'read write',
          client_id: payload.client_id || 'mcp_client',
        })
          .setProtectedHeader({ alg: 'HS256' })
          .setIssuedAt()
          .setExpirationTime(MCP_TOKEN_EXPIRY)
          .sign(MCP_TOKEN_SECRET)

        return NextResponse.json({
          access_token: accessToken,
          token_type: 'Bearer',
          expires_in: 86400, // 24 hours in seconds
          scope: 'read write'
        })
      } catch (error) {
        return NextResponse.json({ 
          error: 'invalid_grant',
          error_description: 'Invalid refresh token' 
        }, { status: 400 })
      }
    }

    return NextResponse.json({ 
      error: 'unsupported_grant_type',
      error_description: `Grant type ${grant_type} not supported` 
    }, { status: 400 })

  } catch (error) {
    console.error('Token exchange error:', error)
    return NextResponse.json({ 
      error: 'server_error',
      error_description: 'Internal server error' 
    }, { status: 500 })
  }
}