import { NextResponse } from 'next/server'

// OAuth 2.0 Authorization Server Metadata
// This tells MCP clients how to authenticate with Supastate
// We use Supabase for actual authentication, this just provides the endpoints
export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.supastate.ai'
  
  return NextResponse.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/api/mcp/oauth/authorize`,
    token_endpoint: `${baseUrl}/api/mcp/oauth/token`,
    token_endpoint_auth_methods_supported: ['none'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: ['read', 'write'],
    response_modes_supported: ['query'],
    // We don't require client registration - any MCP client can connect
    client_registration_types_supported: ['automatic']
  })
}