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
    // MCP requires automatic client registration
    client_registration_types_supported: ['automatic']
  })
}