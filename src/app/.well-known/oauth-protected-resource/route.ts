import { NextResponse } from 'next/server'

// OAuth 2.0 Protected Resource Metadata
// This tells MCP clients how this resource server is protected
export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.supastate.ai'
  
  return NextResponse.json({
    resource: baseUrl,
    authorization_servers: [baseUrl],
    bearer_methods_supported: ['header'],
    resource_documentation: `${baseUrl}/docs/api`,
    resource_signing_alg_values_supported: ['RS256'],
    resource_policy_uri: `${baseUrl}/policy`,
    resource_tos_uri: `${baseUrl}/terms`,
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