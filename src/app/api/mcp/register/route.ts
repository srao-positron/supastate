import { NextRequest, NextResponse } from 'next/server'

// Dynamic Client Registration endpoint
// MCP clients can register themselves automatically
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // For MCP, we support automatic registration
    // Generate a client_id for the requesting client
    const clientId = `mcp_${Date.now()}_${Math.random().toString(36).substring(7)}`
    
    return NextResponse.json({
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      // We don't require client secrets for public clients
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      redirect_uris: body.redirect_uris || [],
      scope: 'read write',
      // MCP-specific metadata
      mcp_version: '1.0',
      client_name: body.client_name || 'MCP Client',
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'Invalid registration request' },
      { status: 400 }
    )
  }
}