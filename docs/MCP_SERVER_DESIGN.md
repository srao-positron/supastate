# Supastate MCP Server Design

## Overview

The Supastate MCP (Model Context Protocol) server exposes our rich knowledge graph of code, memories, and GitHub data to LLMs through a secure, OAuth-authenticated interface. This server supercharges coding assistants by providing deep context about codebases, development history, and cross-entity relationships.

## Authentication

### OAuth 2.0 Flow
- **Provider**: Supabase Auth (backing Supastate)
- **Flow**: Authorization Code with PKCE
- **Scopes**: `read` (default), `write` (future)
- **Token Management**: Automatic refresh token handling
- **Session Storage**: In-memory cache with TTL

### Security Model
- All queries filtered by user/workspace ownership
- Row-Level Security (RLS) enforcement at database level
- Neo4j queries use ownership filters
- No cross-workspace data leakage

## Architecture

### Server Components
1. **MCP Server Core**: Handles protocol, tool registration, OAuth flow
2. **Query Engine**: Translates MCP requests to Neo4j/Postgres queries
3. **Response Formatter**: Structures data for optimal LLM consumption
4. **Cache Layer**: Redis-backed caching for frequent queries
5. **Relationship Navigator**: Traverses graph relationships intelligently

### Data Sources
1. **Neo4j**: Code entities, memories, GitHub objects, relationships
2. **PostgreSQL**: Metadata, user/workspace info, configurations
3. **Vector Indexes**: Semantic search capabilities
4. **Real-time Updates**: WebSocket subscriptions (future)

## MCP Resources

### 1. Code Entities (`code://`)
Access code objects with rich metadata and relationships.

```typescript
interface CodeResource {
  uri: string;           // code://workspace/project/file/function
  name: string;          // Human-readable name
  mimeType: string;      // application/vnd.supastate.code+json
  description: string;   // Rich description for LLM understanding
}
```

**Examples**:
- `code://workspace-123/camille/src/server.ts` - File entity
- `code://workspace-123/camille/src/server.ts/startServer` - Function entity
- `code://workspace-123/camille/src/types.ts/MemoryChunk` - Type/Interface

**Response includes**:
- Full source code
- AST metadata
- Import/export relationships
- Function signatures
- Type definitions
- Related entities

### 2. Memory Entities (`memory://`)
Access conversation memories with temporal context.

```typescript
interface MemoryResource {
  uri: string;           // memory://workspace/session/chunk
  name: string;          // Session name with date
  mimeType: string;      // application/vnd.supastate.memory+json
  description: string;   // Summary of conversation
}
```

**Examples**:
- `memory://workspace-123/session-abc` - Full session
- `memory://workspace-123/session-abc/chunk-1` - Specific chunk

**Response includes**:
- Conversation transcript
- Code references discussed
- Decisions made
- Problems solved
- Related memories

### 3. GitHub Entities (`github://`)
Access GitHub repositories, PRs, issues, and commits.

```typescript
interface GitHubResource {
  uri: string;           // github://owner/repo/type/id
  name: string;          // Repository or object name
  mimeType: string;      // application/vnd.supastate.github+json
  description: string;   // Rich context about the object
}
```

**Examples**:
- `github://anthropics/claude-code` - Repository
- `github://anthropics/claude-code/pulls/123` - Pull request
- `github://anthropics/claude-code/issues/456` - Issue
- `github://anthropics/claude-code/commits/abc123` - Commit

### 4. Relationships (`graph://`)
Navigate entity relationships in the knowledge graph.

```typescript
interface GraphResource {
  uri: string;           // graph://relationship-type/source/target
  name: string;          // Relationship description
  mimeType: string;      // application/vnd.supastate.graph+json
  description: string;   // Context about the relationship
}
```

**Examples**:
- `graph://imports/file-a/file-b` - Import relationship
- `graph://references/memory-1/code-function` - Memory referencing code
- `graph://similar/code-1/code-2` - Semantic similarity

## MCP Tools

### 1. Semantic Search (`search`)
Unified search across all entity types.

```typescript
interface SearchTool {
  name: "search";
  description: "Search across code, memories, and GitHub data using natural language";
  inputSchema: {
    query: string;        // Natural language query
    types?: string[];     // Filter by entity types
    limit?: number;       // Max results (default 20)
    workspace?: string;   // Specific workspace filter
  };
}
```

**Example uses**:
- "Find all code implementing authentication"
- "Show memories discussing database design"
- "Find GitHub PRs about performance"

### 2. Code Search (`searchCode`)
Specialized code search with language awareness.

```typescript
interface CodeSearchTool {
  name: "searchCode";
  description: "Search code with language-specific understanding";
  inputSchema: {
    query: string;        // Code pattern or natural language
    language?: string;    // Filter by language
    project?: string;     // Filter by project
    includeTests?: boolean;
    includeImports?: boolean;
  };
}
```

### 3. Memory Search (`searchMemories`)
Search conversation history with temporal awareness.

```typescript
interface MemorySearchTool {
  name: "searchMemories";
  description: "Search development conversations and decisions";
  inputSchema: {
    query: string;        // Natural language query
    dateRange?: {
      start?: string;     // ISO date
      end?: string;       // ISO date
    };
    projects?: string[];  // Filter by projects discussed
  };
}
```

### 4. Relationship Explorer (`exploreRelationships`)
Traverse the knowledge graph.

```typescript
interface RelationshipTool {
  name: "exploreRelationships";
  description: "Find connections between entities";
  inputSchema: {
    entityUri: string;    // Starting entity
    relationshipTypes?: string[]; // Filter relationships
    depth?: number;       // Traversal depth (max 3)
    direction?: "in" | "out" | "both";
  };
}
```

### 5. Entity Inspector (`inspectEntity`)
Get detailed information about any entity.

```typescript
interface InspectTool {
  name: "inspectEntity";
  description: "Get comprehensive details about an entity";
  inputSchema: {
    uri: string;          // Entity URI
    includeRelationships?: boolean;
    includeContent?: boolean;
    includeSimilar?: boolean;
  };
}
```

### 6. Project Overview (`getProjectOverview`)
High-level project understanding.

```typescript
interface ProjectOverviewTool {
  name: "getProjectOverview";
  description: "Get architectural overview of a project";
  inputSchema: {
    projectName: string;
    includeStats?: boolean;
    includeMainComponents?: boolean;
    includeRecentActivity?: boolean;
  };
}
```

### 7. Timeline Query (`queryTimeline`)
Understand development history.

```typescript
interface TimelineTool {
  name: "queryTimeline";
  description: "Query development timeline across all entities";
  inputSchema: {
    dateRange?: {
      start?: string;
      end?: string;
    };
    entityTypes?: string[];
    projects?: string[];
  };
}
```

## Response Optimization for LLMs

### 1. Structured Responses
All responses follow a consistent schema optimized for LLM parsing:

```typescript
interface MCPResponse<T> {
  data: T;
  context: {
    totalResults: number;
    returnedResults: number;
    processingTime: number;
    dataFreshness: string; // ISO timestamp
  };
  relationships: {
    type: string;
    target: string;
    strength: number;
  }[];
  suggestions: string[]; // Next actions the LLM might take
}
```

### 2. Progressive Disclosure
- Initial responses include summaries
- Full content available on request
- Relationship counts before full traversal
- Sampling for large result sets

### 3. Context Enrichment
- Automatic inclusion of highly-related entities
- Temporal context for memories
- Code examples for patterns
- Common usage patterns

## Implementation Plan

### Phase 1: Core MCP Server (Week 1)
1. Set up MCP server with TypeScript SDK
2. Implement OAuth flow with Supabase
3. Basic tool registration
4. Security filter implementation

### Phase 2: Search Tools (Week 1)
1. Implement unified search tool
2. Code-specific search tool
3. Memory search tool
4. Response formatting

### Phase 3: Resource Providers (Week 2)
1. Code resource provider
2. Memory resource provider
3. GitHub resource provider
4. Graph relationship provider

### Phase 4: Advanced Tools (Week 2)
1. Relationship explorer
2. Entity inspector
3. Project overview
4. Timeline query

### Phase 5: Testing & Optimization (Week 3)
1. Claude Desktop integration
2. Claude Code integration
3. Performance optimization
4. Documentation

## Configuration

```typescript
interface MCPServerConfig {
  supabase: {
    url: string;
    anonKey: string;
  };
  neo4j: {
    uri: string;
    user: string;
    password: string;
  };
  redis?: {
    url: string;
  };
  server: {
    port: number;
    corsOrigins: string[];
  };
  oauth: {
    clientId: string;
    redirectUri: string;
    scopes: string[];
  };
}
```

## Deployment

### Docker Container
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm ci --production
EXPOSE 3000
CMD ["node", "dist/mcp-server.js"]
```

### Environment Variables
```bash
SUPABASE_URL=https://...supabase.co
SUPABASE_ANON_KEY=...
NEO4J_URI=bolt://...
NEO4J_USER=neo4j
NEO4J_PASSWORD=...
REDIS_URL=redis://...
MCP_PORT=3000
OAUTH_CLIENT_ID=...
```

## Monitoring & Observability

### Metrics
- Request latency by tool/resource
- OAuth success/failure rates
- Cache hit rates
- Neo4j query performance
- Active sessions

### Logging
- Structured JSON logs
- Request/response tracking
- Error categorization
- Security events

## Security Considerations

1. **Data Isolation**: Strict workspace boundaries
2. **Rate Limiting**: Per-user and per-tool limits
3. **Query Complexity**: Neo4j query timeout and depth limits
4. **Token Security**: Secure token storage and rotation
5. **Audit Trail**: All data access logged

## Future Enhancements

1. **Real-time Updates**: WebSocket subscriptions for live data
2. **Write Operations**: Controlled entity creation/updates
3. **Custom Queries**: User-defined Cypher queries
4. **Batch Operations**: Efficient bulk queries
5. **Caching Strategy**: Intelligent pre-fetching
6. **Multi-LLM Support**: Optimize for different models