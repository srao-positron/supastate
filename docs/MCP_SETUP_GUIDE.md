# Supastate MCP Server Setup Guide

## Overview

The Supastate MCP server provides LLMs with access to your code knowledge graph, including:
- Code entities and relationships
- Development conversation memories  
- GitHub repositories and metadata
- Semantic search across all data types

## Installation

### 1. Prerequisites

- Node.js 18+ installed
- Supastate account with data ingested
- Claude Desktop or Claude Code

### 2. Server Setup

1. Clone the Supastate repository:
```bash
git clone https://github.com/supastate/supastate.git
cd supastate
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env.local` with your credentials:
```bash
SUPABASE_URL=https://zqlfxakbkwssxfynrmnk.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEO4J_URI=bolt://your-neo4j-instance
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-neo4j-password
```

4. Build the server:
```bash
npm run build
npx tsc mcp-server.ts --outDir dist
```

## Claude Desktop Configuration

### 1. Open Claude Desktop Settings

Navigate to Settings → Developer → MCP Servers

### 2. Add Supastate Server

Add the following configuration:

```json
{
  "supastate": {
    "command": "node",
    "args": ["/path/to/supastate/dist/mcp-server.js"],
    "env": {
      "NODE_ENV": "production"
    },
    "oauth": {
      "authorize_url": "https://www.supastate.ai/api/mcp/oauth/authorize",
      "token_url": "https://www.supastate.ai/api/mcp/oauth/token",
      "client_id": "mcp-supastate",
      "scopes": ["read"]
    }
  }
}
```

### 3. Save and Restart Claude Desktop

The server will appear in the MCP tools list after authentication.

## OAuth Authentication Flow

1. When you first use Supastate tools, Claude will prompt for authentication
2. You'll be redirected to Supastate login page
3. After login, authorize Claude to access your data
4. You'll be redirected back to Claude with access granted

## Available Tools

### 1. `search` - Unified Search
Search across all your data with natural language queries.

**Examples:**
- "Find all authentication implementations"
- "Show conversations about database design"
- "Find GitHub PRs related to performance"

### 2. `searchCode` - Code-Specific Search
Search code with programming language awareness.

**Examples:**
- "Find all React hooks"
- "Show TypeScript interfaces for user models"
- "Find all API endpoints"

### 3. `searchMemories` - Memory Search
Search development conversations with time filtering.

**Examples:**
- "Find discussions about API design last week"
- "Show all conversations about bugs in the auth system"

### 4. `exploreRelationships` - Graph Navigation
Explore connections between entities.

**Examples:**
- Starting from a function, find all callers
- From a memory, find referenced code
- From a GitHub PR, find related code changes

### 5. `inspectEntity` - Detailed Information
Get comprehensive details about any entity.

**Examples:**
- Inspect a specific function with all its relationships
- View a memory chunk with full context
- Examine a GitHub repository structure

## Usage Examples

### Finding Related Code
```
User: Help me understand the authentication system