import { NextResponse } from 'next/server'

// This catch-all route handles any path under oauth-protected-resource
// Including /sse which MCP clients might request
export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.supastate.ai'
  
  // Return the same metadata regardless of the path suffix
  return NextResponse.json({
    resource: `${baseUrl}/mcp`,
    authorization_servers: [
      `${baseUrl}/.well-known/oauth-authorization-server`
    ],
    scopes_supported: ['read', 'write'],
    bearer_methods_supported: ['header'],
    resource_documentation: `${baseUrl}/docs/mcp`,
    resource_signing_alg_values_supported: ['HS256'],
  })
}