# Supastate Design Document

## Overview

Supastate is a cloud-based service that extends Camille's local code intelligence capabilities to enable team collaboration, persistent storage, and multi-agent code reviews. Built on Vercel and Supabase, it serves as the bridge between individual developer's local Camille instances and team-wide knowledge sharing.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                          Supastate Cloud                         │
│  ┌─────────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   Vercel Edge   │  │   Supabase   │  │  GitHub Actions  │  │
│  │   Functions     │  │   Database   │  │   Integration    │  │
│  └────────┬────────┘  └──────┬───────┘  └─────────┬────────┘  │
│           │                   │                     │           │
│  ┌────────▼────────────────────▼──────────────────▼────────┐  │
│  │                    API Gateway                           │  │
│  │  • Team Auth  • Sync API  • Review API  • Search API    │  │
│  └────────────────────────┬─────────────────────────────────┘  │
└───────────────────────────┼─────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
┌───────▼────────┐  ┌───────▼────────┐  ┌──────▼─────────┐
│  Camille Local │  │  Camille Local │  │  GitHub PRs    │
│   Instance 1   │  │   Instance 2   │  │  & Webhooks    │
└────────────────┘  └────────────────┘  └────────────────┘
```

## Core Components

### 1. Data Models (Supabase)

#### Teams & Users
```sql
-- Teams table
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  settings JSONB DEFAULT '{}',
  subscription_tier TEXT DEFAULT 'free'
);

-- Users table (extends Supabase auth.users)
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Team membership
CREATE TABLE team_members (
  team_id UUID REFERENCES teams(id),
  user_id UUID REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (team_id, user_id)
);
```

#### Memory Storage (from Camille)
```sql
-- Conversation memories
CREATE TABLE memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id),
  user_id UUID REFERENCES users(id),
  project_name TEXT NOT NULL,
  chunk_id TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536), -- pgvector for similarity search
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, chunk_id)
);

-- Memory search index
CREATE INDEX memories_embedding_idx ON memories 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

#### Code Graph Storage (from Camille's Kuzu)
```sql
-- Code entities (nodes)
CREATE TABLE code_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id),
  project_name TEXT NOT NULL,
  entity_type TEXT NOT NULL, -- function, class, module, etc.
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  language TEXT NOT NULL,
  signature TEXT,
  docstring TEXT,
  embedding vector(1536),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Code relationships (edges)
CREATE TABLE code_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id),
  project_name TEXT NOT NULL,
  source_id UUID REFERENCES code_entities(id),
  target_id UUID REFERENCES code_entities(id),
  relationship_type TEXT NOT NULL, -- calls, imports, extends, etc.
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Multi-Agent Reviews
```sql
-- Review sessions
CREATE TABLE review_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id),
  pr_url TEXT NOT NULL,
  pr_metadata JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  orchestration_id TEXT, -- from hawking-edison style system
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Review agents
CREATE TABLE review_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES review_sessions(id),
  agent_name TEXT NOT NULL,
  agent_role TEXT NOT NULL,
  agent_prompt TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Review events (real-time tracking)
CREATE TABLE review_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES review_sessions(id),
  agent_id UUID REFERENCES review_agents(id),
  event_type TEXT NOT NULL,
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2. API Architecture

#### Authentication & Authorization
- Supabase Auth with team-based permissions
- API keys for Camille instances (machine-to-machine)
- GitHub App authentication for PR integration

#### Core APIs

##### Memory Sync API
```typescript
// POST /api/memories/sync
interface MemorySyncRequest {
  teamId: string;
  projectName: string;
  chunks: Array<{
    chunkId: string;
    content: string;
    embedding: number[];
    metadata: any;
  }>;
}

// GET /api/memories/search
interface MemorySearchRequest {
  teamId: string;
  query: string;
  projectFilter?: string[];
  limit?: number;
}
```

##### Graph Sync API
```typescript
// POST /api/graph/sync
interface GraphSyncRequest {
  teamId: string;
  projectName: string;
  entities: CodeEntity[];
  relationships: CodeRelationship[];
}

// POST /api/graph/query
interface GraphQueryRequest {
  teamId: string;
  cypherQuery: string; // Cypher-like query language
  projectFilter?: string[];
}
```

##### Multi-Agent Review API
```typescript
// POST /api/reviews/create
interface CreateReviewRequest {
  teamId: string;
  prUrl: string;
  reviewConfig?: {
    style: 'thorough' | 'quick' | 'security-focused';
    autoMergeOnApproval?: boolean;
    customAgents?: AgentDefinition[];
  };
}

// GET /api/reviews/{id}/events
// SSE endpoint for real-time review updates
```

### 3. Multi-Agent PR Review System

Based on hawking-edison's architecture:

#### Review Orchestration Flow
1. **PR Webhook Trigger**: GitHub webhook notifies Supastate of new PR
2. **Context Gathering**: 
   - Fetch PR diff and metadata
   - Search team memories for related discussions
   - Query code graph for affected components
3. **Dynamic Agent Creation**:
   - Analyze PR to determine needed expertise
   - Create specialized agents (security, performance, architecture, etc.)
4. **Panel Discussion**:
   - Agents review code independently
   - Panel discussion for consensus building
   - Tool usage for deep analysis
5. **Result Synthesis**:
   - Aggregate agent findings
   - Generate unified review report
   - Post results to GitHub PR

#### Agent Types (Dynamically Created)
- **Security Auditor**: Reviews auth, injection risks, secrets
- **Performance Analyst**: Checks queries, algorithms, caching
- **Architecture Guardian**: Validates patterns, dependencies
- **Test Coverage Expert**: Ensures adequate testing
- **Documentation Reviewer**: Checks comments, README updates

### 4. Integration Points

#### Camille Integration
- **Memory Push**: Camille pushes new memory chunks
- **Memory Pull**: Camille queries team memories
- **Graph Sync**: Bidirectional graph synchronization
- **Review Triggers**: Camille can trigger PR reviews

#### GitHub Integration
- **GitHub App**: For PR access and commenting
- **Webhooks**: PR events trigger reviews
- **Status Checks**: Block/approve PRs based on reviews
- **Comment Threading**: Engage in PR discussions

### 5. Real-time Features

Using Supabase Realtime:
- Live review progress updates
- Team memory search notifications
- Collaborative code exploration
- Agent discussion streaming

### 6. Security & Privacy

- **Data Isolation**: Strict team-based data separation
- **Encryption**: At-rest and in-transit encryption
- **API Rate Limiting**: Prevent abuse
- **Audit Logging**: Track all data access
- **GDPR Compliance**: Data retention and deletion policies

## Implementation Phases

### Phase 1: Core Infrastructure
- Supabase project setup
- Basic team/user management
- Authentication system
- API gateway on Vercel

### Phase 2: Memory Sync
- Memory storage schema
- Sync API endpoints
- Vector search implementation
- Camille integration client

### Phase 3: Code Graph
- Graph storage design
- Cypher-like query engine
- Graph sync API
- Visualization components

### Phase 4: Multi-Agent Reviews
- Review orchestration engine
- Agent framework
- GitHub integration
- Real-time updates

### Phase 5: Advanced Features
- Cross-team knowledge sharing
- Advanced analytics
- Custom agent creation UI
- Review policy configuration

## Technology Stack

- **Frontend**: Next.js 14 (App Router)
- **Backend**: Vercel Edge Functions
- **Database**: Supabase (PostgreSQL + pgvector)
- **Real-time**: Supabase Realtime
- **Queue**: Vercel Cron + Supabase Queue
- **Search**: pgvector for embeddings
- **Auth**: Supabase Auth
- **Monitoring**: Vercel Analytics + Sentry

## Scalability Considerations

- **Vector Search**: Use pgvector with IVFFlat indexing
- **Graph Queries**: Implement query result caching
- **Review Processing**: Queue-based with worker scaling
- **Memory Limits**: Implement data retention policies
- **API Rate Limiting**: Per-team quotas

## Success Metrics

- **Adoption**: Number of teams using Supastate
- **Engagement**: Daily active memory queries
- **Review Quality**: PR approval correlation
- **Performance**: < 200ms search latency
- **Reliability**: 99.9% uptime SLA