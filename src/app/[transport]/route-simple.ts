import { createMcpHandler } from "@vercel/mcp-adapter"
import { z } from "zod"
import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'
import neo4j from 'neo4j-driver'
import { getOwnershipFilter } from '@/lib/neo4j/query-patterns'
import { NextRequest, NextResponse } from 'next/server'

// Ensure Redis is configured for MCP adapter
const redisUrl = process.env.REDIS_URL || process.env.KV_URL

async function getEmbedding(text: string): Promise<number[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.functions.invoke('generate-embeddings', {
    body: { texts: [text] },
  })

  if (error || !data?.embeddings?.[0]) {
    throw new Error('Failed to generate embedding')
  }

  return data.embeddings[0]
}

function inferTypeFromLabels(labels: string[]): string {
  if (labels.includes('CodeEntity')) return 'code'
  if (labels.includes('Memory')) return 'memory'
  if (labels.includes('GitHubEntity')) return 'github'
  return 'unknown'
}

// Create the MCP handler
const handler = createMcpHandler(
  async (server) => {
    server.tool(
      "searchMemories",
      "Search development conversations and decisions",
      {
        query: z.string().describe('Natural language query'),
        dateRange: z.object({
          start: z.string().optional(),
          end: z.string().optional(),
        }).optional(),
        projects: z.array(z.string()).optional(),
      },
      async (params) => {
        // Tool will check auth when invoked
        throw new Error('Authentication required. Please visit https://www.supastate.ai/auth/mcp to authenticate.')
      }
    )
  },
  {
    capabilities: {
      tools: {
        searchMemories: {
          description: "Search development conversations",
        },
      },
    },
  },
  {
    basePath: "",
    verboseLogs: true,
    maxDuration: 60,
    redisUrl,
  }
)

// Export route handlers that check auth
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.supastate.ai'
  
  // Always require auth header
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new NextResponse(
      JSON.stringify({
        error: 'unauthorized',
        error_description: 'Bearer token required'
      }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'WWW-Authenticate': `Bearer realm="${baseUrl}/mcp", as_uri="${baseUrl}/.well-known/oauth-protected-resource"`,
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  }
  
  // Validate token with Supabase
  const token = authHeader.slice(7)
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser(token)
  
  if (error || !user) {
    return new NextResponse(
      JSON.stringify({
        error: 'unauthorized',
        error_description: 'Invalid token'
      }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'WWW-Authenticate': `Bearer realm="${baseUrl}/mcp", error="invalid_token"`,
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  }
  
  // Token is valid, let request through
  return handler(request)
}

export async function POST(request: NextRequest) {
  return GET(request)
}

export async function DELETE(request: NextRequest) {
  return GET(request)
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}