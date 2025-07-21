# Supastate 2.0: Comprehensive Plan

## Vision
Transform Supastate from a simple sync service into a powerful centralized intelligence hub that LLMs can directly access, with GitHub as the source of truth for all code understanding.

## Three Major Concepts

### 1. Enhanced Metadata for Multi-Dimensional Search

#### Current State
- Basic metadata: team_id, project_name, chunk_id, created_at
- No conversation context
- No user attribution beyond team
- No session tracking

#### Target State
```typescript
interface EnhancedMemoryMetadata {
  // Existing
  team_id: string;
  project_name: string;
  chunk_id: string;
  
  // New dimensional data
  conversation_id: string;      // Group related chunks
  session_id: string;          // Claude Code session
  user_id: string;             // GitHub user ID
  user_login: string;          // GitHub username
  
  // Temporal dimensions
  created_at: timestamp;
  conversation_started_at: timestamp;
  conversation_ended_at?: timestamp;
  
  // Context dimensions
  file_paths: string[];        // Files discussed/modified
  commit_sha?: string;         // Git commit context
  branch_name?: string;        // Working branch
  pr_number?: number;          // Related PR if any
  
  // Semantic dimensions
  topics: string[];            // Extracted topics
  entities_mentioned: string[]; // Code entities referenced
  tools_used: string[];        // Claude tools used
  
  // Activity metadata
  message_count: number;
  code_blocks_count: number;
  files_modified_count: number;
  
  // Search optimization
  search_text: string;         // Denormalized searchable text
  summary?: string;            // AI-generated summary
}
```

#### Implementation Tasks
1. Create new database schema with indexes
2. Build extraction pipeline for metadata
3. Update sync APIs to accept rich metadata
4. Create search APIs with filters for each dimension
5. Add faceted search UI components

### 2. Supastate as MCP Server

#### Architecture
```
Claude Code ─────┐
                 ├──► Supastate MCP Server ◄─── Web API
Other LLMs ──────┘         │
                          │
                    Supabase DB
```

#### MCP Tools to Implement

```typescript
// 1. Search across all team knowledge
tool: "supastate_search_knowledge"
params: {
  query: string;
  filters?: {
    projects?: string[];
    users?: string[];
    date_range?: { from: Date; to: Date };
    has_code?: boolean;
    topics?: string[];
  };
  limit?: number;
}

// 2. Get code graph for repository
tool: "supastate_get_code_graph"
params: {
  repository: string;
  branch?: string;  // defaults to main
  entity_types?: string[];
  include_relationships?: boolean;
}

// 3. Compare local vs source truth
tool: "supastate_compare_code_state"
params: {
  repository: string;
  local_entities: CodeEntity[];
  branch?: string;
}

// 4. Get conversation history
tool: "supastate_get_conversations"
params: {
  project?: string;
  user?: string;
  topic?: string;
  limit?: number;
}

// 5. Analyze codebase patterns
tool: "supastate_analyze_patterns"
params: {
  repository: string;
  pattern_type: "architecture" | "dependencies" | "anti_patterns";
}
```

#### Implementation Components
1. WebSocket/HTTP server for MCP protocol
2. Tool handlers with Supabase queries
3. Authentication via API keys
4. Rate limiting and usage tracking
5. Response streaming for large datasets

### 3. GitHub SSO & Repository Integration

#### Authentication Flow
```
User ──► GitHub OAuth ──► Supastate ──► Create/Update User
           │                               │
           └── Request Repo Permissions ───┘
```

#### Repository Integration Architecture

```typescript
interface RepositoryState {
  // Source of truth (from GitHub)
  main_branch: {
    commit_sha: string;
    analyzed_at: timestamp;
    entities: CodeEntity[];
    relationships: CodeRelationship[];
    stats: {
      total_files: number;
      total_functions: number;
      total_classes: number;
      languages: Record<string, number>;
    };
  };
  
  // Local state (from Camille syncs)
  local_branches: {
    [branch_name: string]: {
      base_commit: string;  // Where it diverged from main
      last_sync: timestamp;
      entities_added: CodeEntity[];
      entities_modified: CodeEntity[];
      entities_deleted: string[];
    };
  };
  
  // Permissions
  github_installation_id: number;
  accessible_by: string[];  // GitHub user IDs
}
```

#### Key Features
1. **Automatic Main Branch Analysis**
   - Webhook on push to main
   - Full codebase analysis
   - Store as "source of truth"

2. **Branch Tracking**
   - Track which branch Camille is working on
   - Store diffs against main
   - Enable "what changed" queries

3. **Permission Model**
   - Use GitHub teams/collaborators
   - Inherit repo permissions
   - No separate Supastate teams

#### Implementation Tasks
1. Remove email/password auth
2. Update user model to GitHub-centric
3. Expand GitHub App permissions
4. Build repository analyzer service
5. Create branch tracking system
6. Design diff storage schema

## Migration Strategy

### Phase 1: Enhanced Metadata (Week 1)
- Database schema updates
- Update sync APIs
- Backward compatibility layer

### Phase 2: GitHub SSO (Week 2)
- Auth system overhaul
- User migration
- Permission system

### Phase 3: Repository Integration (Week 3)
- GitHub App updates
- Repository analyzer
- Source truth storage

### Phase 4: MCP Server (Week 4)
- Server implementation
- Tool development
- Testing with Claude

## Database Schema Changes

### New Tables Needed

```sql
-- Enhanced conversations table
CREATE TABLE conversations (
  id UUID PRIMARY KEY,
  team_id UUID REFERENCES teams(id),
  user_id UUID REFERENCES users(id),
  session_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  summary TEXT,
  topics TEXT[],
  tools_used TEXT[],
  files_touched TEXT[],
  metadata JSONB
);

-- Repository states
CREATE TABLE repository_states (
  id UUID PRIMARY KEY,
  github_repo_id BIGINT NOT NULL,
  full_name TEXT NOT NULL,
  main_branch_sha TEXT NOT NULL,
  analyzed_at TIMESTAMPTZ NOT NULL,
  stats JSONB,
  UNIQUE(github_repo_id, main_branch_sha)
);

-- Branch states
CREATE TABLE branch_states (
  id UUID PRIMARY KEY,
  repository_state_id UUID REFERENCES repository_states(id),
  branch_name TEXT NOT NULL,
  base_commit_sha TEXT NOT NULL,
  last_sync TIMESTAMPTZ NOT NULL,
  local_changes JSONB
);

-- User repositories (permissions)
CREATE TABLE user_repositories (
  user_id UUID REFERENCES users(id),
  github_repo_id BIGINT,
  permissions TEXT[], -- admin, write, read
  PRIMARY KEY (user_id, github_repo_id)
);
```

### Updates to Existing Tables

```sql
-- Enhance memories table
ALTER TABLE memories 
ADD COLUMN conversation_id UUID REFERENCES conversations(id),
ADD COLUMN user_id UUID REFERENCES users(id),
ADD COLUMN session_id TEXT,
ADD COLUMN file_paths TEXT[],
ADD COLUMN commit_sha TEXT,
ADD COLUMN branch_name TEXT,
ADD COLUMN topics TEXT[],
ADD COLUMN search_text TEXT GENERATED ALWAYS AS (
  content || ' ' || 
  COALESCE(metadata->>'summary', '') || ' ' ||
  array_to_string(topics, ' ')
) STORED;

-- Add indexes for multi-dimensional search
CREATE INDEX memories_conversation_idx ON memories(conversation_id);
CREATE INDEX memories_user_project_idx ON memories(user_id, project_name);
CREATE INDEX memories_temporal_idx ON memories(created_at DESC);
CREATE INDEX memories_search_idx ON memories USING GIN(to_tsvector('english', search_text));
```

## API Design

### Source Truth vs Local APIs

```typescript
// Get source of truth
GET /api/repository/{owner}/{repo}/truth
Response: {
  main_branch: string;
  commit_sha: string;
  analyzed_at: string;
  stats: RepositoryStats;
  graph_id: string;  // For detailed graph queries
}

// Get local state diff
GET /api/repository/{owner}/{repo}/diff
Query: { branch: string, since?: string }
Response: {
  branch: string;
  base_commit: string;
  changes: {
    entities: { added: [], modified: [], deleted: [] };
    relationships: { added: [], removed: [] };
  };
  summary: string;
}

// Search with context
POST /api/search/contextual
Body: {
  query: string;
  context: {
    repository?: string;
    branch?: string;
    time_range?: { from: string; to: string };
    users?: string[];
  };
}
```

## Success Metrics

1. **Search Quality**: LLMs can find relevant conversations within 2 queries
2. **Source Truth Accuracy**: 100% match with GitHub main branch
3. **MCP Performance**: < 200ms response time for most queries
4. **User Adoption**: 80% of Camille users connect to Supastate
5. **Repository Coverage**: Average 5 repos per team

## Security Considerations

1. **GitHub Token Scoping**: Request minimal permissions
2. **Repository Access**: Always verify via GitHub API
3. **Rate Limiting**: Implement per-user and per-team limits
4. **Data Isolation**: Ensure repository data respects GitHub permissions
5. **Audit Logging**: Track all data access for compliance