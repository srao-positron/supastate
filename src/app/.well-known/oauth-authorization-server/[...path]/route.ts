import { NextResponse } from 'next/server'

// This catch-all route handles any path under oauth-authorization-server
// Including /sse which MCP clients might request
export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.supastate.ai'
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  
  // Return the same metadata regardless of the path suffix
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
    jwks_uri: supabaseUrl ? `${supabaseUrl}/auth/v1/jwks` : undefined,
    registration_endpoint: `${baseUrl}/api/mcp/register`,
    client_registration_types_supported: ['automatic'],
    service_documentation: `${baseUrl}/docs/mcp`,
    ui_locales_supported: ['en'],
    claims_supported: ['sub', 'email', 'name'],
    mcp_version: '1.0'
  }, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }
  })
}