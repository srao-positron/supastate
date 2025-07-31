import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  // MCP server information endpoint
  return NextResponse.json({
    name: 'Supastate MCP Server',
    version: '1.0.0',
    description: 'Access your code knowledge graph through Model Context Protocol',
    mcp: {
      endpoint: 'https://www.supastate.ai',
      transports: ['http', 'sse'],
      authentication: {
        type: 'oauth',
        auth_url: 'https://zqlfxakbkwssxfynrmnk.supabase.co/auth/v1/authorize',
        token_url: 'https://zqlfxakbkwssxfynrmnk.supabase.co/auth/v1/token',
        client_id: 'supastate-mcp',
        scopes: ['openid', 'email', 'profile'],
      },
    },
    tools: [
      {
        name: 'search',
        description: 'Search across code, memories, and GitHub data using natural language',
        schema: {
          query: 'string (required)',
          types: 'array of ["code", "memory", "github"] (optional)',
          limit: 'number (optional, default 20)',
        },
      },
      {
        name: 'searchCode',
        description: 'Search code with language-specific understanding',
        schema: {
          query: 'string (required)',
          language: 'string (optional)',
          project: 'string (optional)',
          includeTests: 'boolean (optional)',
        },
      },
      {
        name: 'searchMemories',
        description: 'Search development conversations with temporal awareness',
        schema: {
          query: 'string (required)',
          dateRange: 'object with start/end dates (optional)',
          projects: 'array of strings (optional)',
        },
      },
      {
        name: 'exploreRelationships',
        description: 'Navigate the knowledge graph from any entity',
        schema: {
          entityUri: 'string (required)',
          relationshipTypes: 'array of strings (optional)',
          depth: 'number (optional, max 3)',
          direction: '"in" | "out" | "both" (optional)',
        },
      },
      {
        name: 'inspectEntity',
        description: 'Get comprehensive details about any entity',
        schema: {
          uri: 'string (required)',
          includeRelationships: 'boolean (optional)',
          includeContent: 'boolean (optional)',
          includeSimilar: 'boolean (optional)',
        },
      },
    ],
  })
}