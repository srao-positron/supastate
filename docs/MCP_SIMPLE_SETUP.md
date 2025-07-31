# Supastate MCP Server - Simplified Setup Guide

## Overview

The Supastate MCP server provides LLMs with access to your code knowledge graph using your existing Supabase authentication. No separate OAuth flow needed!

## Quick Start

### 1. Get Your Supabase Auth Token

1. Log in to www.supastate.ai
2. Open browser developer tools (F12)
3. Go to Application/Storage → Local Storage → https://www.supastate.ai
4. Find the key that contains `auth-token`
5. Copy the token value from the JSON (it starts with `eyJ...`)

### 2. Configure Claude Desktop

Add to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "supastate": {
      "command": "node",
      "args": ["/path/to/supastate/dist/mcp-server.js"],
      "env": {
        "SUPABASE_AUTH_TOKEN": "your-token-here",
        "NEXT_PUBLIC_SUPABASE_URL": "https://zqlfxakbkwssxfynrmnk.supabase.co",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY": "your-anon-key",
        "NEO4J_URI": "bolt://your-neo4j-instance",
        "NEO4J_USER": "neo4j",
        "NEO4J_PASSWORD": "your-password"
      }
    }
  }
}
```

### 3. Build and Start

```bash
cd /path/to/supastate
npm install
npm run mcp:build
```

### 4. Restart Claude Desktop

The Supastate tools will now be available in Claude!

## Available Tools

### 🔍 `search`
Unified search across all your data.
```
"Find all authentication implementations across code and memories"
```

### 💻 `searchCode`
Code-specific search with language awareness.
```
"Find all React hooks in the project"
```

### 💭 `searchMemories`
Search development conversations.
```
"What did we discuss about the API design last week?"
```

### 🔗 `exploreRelationships`
Navigate entity connections.
```
"Show me what calls the authentication function"
```

### 🔎 `inspectEntity`
Get detailed information about any entity.
```
"Tell me everything about the User model"
```

## Token Management

Your Supabase token expires after a period of time. When it does:

1. Log in to www.supastate.ai again
2. Get the new token from browser storage
3. Update your Claude Desktop config
4. Restart Claude Desktop

## Troubleshooting

### "Invalid authentication token"
- Your token has expired - get a fresh one from www.supastate.ai
- Make sure you copied the entire token (it's very long)

### "Cannot connect to Neo4j"
- Check your Neo4j credentials in the config
- Ensure Neo4j is accessible from your network

### Tools not appearing
- Make sure the MCP server built successfully
- Check Claude Desktop logs for errors
- Verify all environment variables are set

## Security Notes

- Your auth token gives access to your Supastate data
- Keep your config file secure
- Tokens are scoped to your user/workspace only
- No data is shared across workspaces

## Future Improvements

We're working on:
- Automatic token refresh
- Direct Claude Desktop OAuth integration
- Real-time data updates
- Write operations support