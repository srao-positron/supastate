#!/usr/bin/env node

/**
 * Supastate MCP Server
 * 
 * This server exposes Supastate's knowledge graph to LLMs via the Model Context Protocol.
 * It requires OAuth authentication and respects workspace boundaries.
 * 
 * Usage:
 * 1. Configure in Claude Desktop settings
 * 2. Authenticate via OAuth flow
 * 3. Access code, memories, and GitHub data
 */

import dotenv from 'dotenv'
import { resolve } from 'path'

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') })

// Import and start server
import { SupastateMCPServer } from './src/lib/mcp/server'

async function main() {
  const server = new SupastateMCPServer()
  
  try {
    await server.start()
  } catch (error) {
    console.error('Failed to start MCP server:', error)
    process.exit(1)
  }

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.error('Shutting down MCP server...')
    await server.stop()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    console.error('Shutting down MCP server...')
    await server.stop()
    process.exit(0)
  })
}

main().catch(console.error)