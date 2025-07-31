import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  // Simple endpoint to provide MCP server information
  return NextResponse.json({
    name: 'Supastate MCP Server',
    version: '1.0.0',
    description: 'Access your code knowledge graph through Model Context Protocol',
    authentication: {
      type: 'supabase',
      instructions: 'Use your Supabase auth token from www.supastate.ai',
    },
    tools: [
      {
        name: 'search',
        description: 'Search across code, memories, and GitHub data',
      },
      {
        name: 'searchCode',
        description: 'Search code with language-specific understanding',
      },
      {
        name: 'searchMemories',
        description: 'Search development conversations',
      },
      {
        name: 'exploreRelationships',
        description: 'Navigate the knowledge graph',
      },
      {
        name: 'inspectEntity',
        description: 'Get detailed information about any entity',
      },
    ],
  })
}