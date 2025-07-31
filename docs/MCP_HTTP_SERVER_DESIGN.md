# Supastate HTTP MCP Server Design

## Overview

The Supastate MCP server is implemented as HTTP endpoints in our Next.js application, allowing Claude Desktop and Claude Web to connect directly via OAuth. This provides secure, web-based access to the knowledge graph without requiring local installation.

## Architecture

### HTTP Transport
- **Base URL**: `https://www.supastate.ai/[transport]`
- **Transport Types**: HTTP, SSE (Server-Sent Events)
- **Authentication**: OAuth 2.0 via Claude client
- **Implementation**: Next.js API routes with Vercel MCP adapter

### Authentication Flow
1. Claude initiates OAuth connection to Supastate
2. User logs in via Supabase Auth (existing account)
3. Claude receives OAuth token
4. All MCP requests include auth token
5. Server validates via Supabase and applies workspace filters

### Technology Stack
- **Framework**: Next.js 14 with App Router
- **MCP Library**: `@vercel/mcp-adapter`
- **Database**: PostgreSQL (Supabase) + Neo4j
- **Hosting**: Vercel
- **Auth**: Supabase Auth

## API Endpoints

### Base MCP Route
`/[transport]` - Dynamic route supporting different transports

Handles:
- Tool discovery
- Tool execution
- Resource listing
- Authentication

## MCP Tools Implementation

### 1. Search Tool (`search`)
Unified semantic search across all entity types.

**Input**:
```typescript
{
  query: string
  types?: ('code' | 'memory' | 'github')[]
  limit?: number
  workspace?: string
}
```

**Implementation**:
- Uses Neo4j vector indexes (`unified_embeddings`)
- Applies ownership filters
- Returns ranked results with scores

### 2. Code Search Tool (`searchCode`)
Language-aware code search with filters.

**Input**:
```typescript
{
  query: string
  language?: string
  project?: string
  includeTests?: boolean
  includeImports?: boolean
}
```

**Implementation**:
- Searches `code_embeddings` index
- Filters by language, project, test files
- Returns code entities with metadata

### 3. Memory Search Tool (`searchMemories`)
Temporal search of development conversations.

**Input**:
```typescript
{
  query: string
  dateRange?: {
    start?: string
    end?: string
  }
  projects?: string[]
}
```

**Implementation**:
- Searches `memory_embeddings` index
- Filters by date range and projects
- Returns conversation chunks

### 4. Relationship Explorer (`exploreRelationships`)
Graph traversal from entity URIs.

**Input**:
```typescript
{
  entityUri: string
  relationshipTypes?: string[]
  depth?: number
  direction?: 'in' | 'out' | 'both'
}
```

**Implementation**:
- Cypher path queries
- Configurable depth (max 3)
- Returns relationship graph

### 5. Entity Inspector (`inspectEntity`)
Detailed entity information.

**Input**:
```typescript
{
  uri: string
  includeRelationships?: boolean
  includeContent?: boolean
  includeSimilar?: boolean
}
```

**Implementation**:
- Direct node lookup
- Optional relationship loading
- Similarity search via embeddings

## Security & Multi-tenancy

### Workspace Isolation
Every query includes ownership filters:
```typescript
const ownershipFilter = getOwnershipFilter({
  userId: user.id,
  workspaceId: userData?.team_id ? `team:${userData.team_id}` : `user:${user.id}`,
  nodeAlias: 'n'
})
```

### Authentication
- OAuth token validated on every request
- User context extracted from Supabase Auth
- Service role used only for system operations

### Data Access
- All Neo4j queries filtered by ownership
- No cross-workspace data leakage
- RLS policies on PostgreSQL tables

## Configuration for Claude

### Claude Desktop
```json
{
  "mcpServers": {
    "supastate": {
      "type": "http",
      "url": "https://www.supastate.ai",
      "auth": {
        "type": "oauth",
        "client_id": "supastate-mcp",
        "auth_url": "https://zqlfxakbkwssxfynrmnk.supabase.co/auth/v1/authorize",
        "token_url": "https://zqlfxakbkwssxfynrmnk.supabase.co/auth/v1/token",
        "scopes": ["openid", "email", "profile"]
      }
    }
  }
}
```

### Claude Web
The MCP server will be available directly in Claude Web once registered with Anthropic.

## Performance Optimizations

### Caching
- Edge function responses cached
- Embedding generation cached
- Neo4j query results cached with TTL

### Query Optimization
- Vector indexes for semantic search
- Limited traversal depth
- Result pagination

### Edge Configuration
- Max duration: 60 seconds (can increase for Pro)
- Streaming support via SSE transport
- Vercel Edge runtime

## Deployment

### Environment Variables
```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# Neo4j
NEO4J_URI=bolt://...
NEO4J_USER=neo4j
NEO4J_PASSWORD=...

# OpenAI (for embeddings)
OPENAI_API_KEY=...
```

### Vercel Configuration
- Enable Vercel KV for SSE transport
- Configure environment variables
- Set function timeout appropriately

## Usage Examples

### Search for Authentication Code
```javascript
{
  "tool": "search",
  "arguments": {
    "query": "authentication implementation",
    "types": ["code", "memory"]
  }
}
```

### Explore Function Calls
```javascript
{
  "tool": "exploreRelationships",
  "arguments": {
    "entityUri": "code://function/auth/login",
    "relationshipTypes": ["CALLS", "CALLED_BY"],
    "direction": "both"
  }
}
```

### Inspect Memory with Context
```javascript
{
  "tool": "inspectEntity",
  "arguments": {
    "uri": "memory://session-123/chunk-456",
    "includeRelationships": true,
    "includeSimilar": true
  }
}
```

## Benefits

1. **No Installation Required**: Works directly in Claude
2. **Always Up-to-Date**: Deployed with main app
3. **Secure**: OAuth + workspace isolation
4. **Scalable**: Vercel Edge Functions
5. **Rich Context**: Full knowledge graph access

## Future Enhancements

1. **Streaming Responses**: Use SSE for large results
2. **Write Operations**: Allow entity creation/updates
3. **Custom Queries**: User-defined Cypher queries
4. **Real-time Updates**: WebSocket subscriptions
5. **Resource Providers**: Browse code/memory hierarchies