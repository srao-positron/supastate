import { NextResponse } from 'next/server'

// OAuth 2.0 Protected Resource Metadata (RFC 9728)
// This tells MCP clients how this resource server is protected
export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.supastate.ai'
  
  // According to RFC 9728, this should point to the authorization server
  // The resource is the SSE endpoint that MCP clients connect to
  return NextResponse.json({
    resource: `${baseUrl}/sse`,
    authorization_servers: [
      `${baseUrl}/.well-known/oauth-authorization-server`
    ],
    scopes_supported: ['read', 'write'],
    bearer_methods_supported: ['header'],
    resource_documentation: `${baseUrl}/docs/mcp`,
    resource_signing_alg_values_supported: ['HS256'],
  })
}

// Handle CORS preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}