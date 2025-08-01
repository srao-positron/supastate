import { NextResponse } from 'next/server'

// OAuth 2.0 Authorization Server Metadata
// This tells MCP clients how to authenticate with Supastate
// We use Supabase for actual authentication, this just provides the endpoints
export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.supastate.ai'
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  
  return NextResponse.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/api/mcp/auth`,
    token_endpoint: `${baseUrl}/api/mcp/token`,
    token_endpoint_auth_methods_supported: ['none'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: ['read', 'write'],
    response_modes_supported: ['query'],
    // JWKS endpoint for token verification (if we expose Supabase JWTs)
    jwks_uri: supabaseUrl ? `${supabaseUrl}/auth/v1/jwks` : undefined,
    // Dynamic client registration - MCP clients don't need to pre-register
    registration_endpoint: `${baseUrl}/api/mcp/register`,
    client_registration_types_supported: ['automatic'],
    // Additional metadata that might help MCP clients
    service_documentation: `${baseUrl}/docs/mcp`,
    ui_locales_supported: ['en'],
    claims_supported: ['sub', 'email', 'name'],
    // Indicate this is for MCP
    mcp_version: '1.0'
  }, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }
  })
}