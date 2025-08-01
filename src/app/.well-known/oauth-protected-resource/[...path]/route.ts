import { NextResponse } from 'next/server'

// This catch-all route handles any path under oauth-protected-resource
// Including /sse which MCP clients might request
export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.supastate.ai'
  
  // Return the same metadata regardless of the path suffix
  // The resource is the SSE endpoint that MCP clients connect to
  return NextResponse.json({
    resource: `${baseUrl}/sse`,
    authorization_servers: [
      baseUrl  // Just the base URL, client will append /.well-known/oauth-authorization-server
    ]
  })
}